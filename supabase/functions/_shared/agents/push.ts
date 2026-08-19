// Web Push for agent notifications.
//
// Deliberately payload-less. Encrypting a push body requires the full aes128gcm
// + ECDH key-agreement dance per subscription; sending no body skips all of it
// and means nothing about your business ever transits a third-party push
// service. The service worker shows a fixed message and opens /admin/agents,
// where the real brief is fetched over an authenticated session.
//
// Requires VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (P-256, base64url) and
// VAPID_SUBJECT (a mailto: or https: URL). Without them, push is skipped
// silently rather than failing a run.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "";

export const pushConfigured = () => !!(VAPID_PUBLIC && VAPID_PRIVATE && VAPID_SUBJECT);

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Import the raw P-256 private scalar as an ECDSA signing key. */
async function importVapidKey(): Promise<CryptoKey> {
  const d = b64urlToBytes(VAPID_PRIVATE);
  const pub = b64urlToBytes(VAPID_PUBLIC); // uncompressed point: 0x04 || X || Y
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: b64url(d),
    x: b64url(pub.slice(1, 33)),
    y: b64url(pub.slice(33, 65)),
    ext: true,
  };
  return await crypto.subtle.importKey(
    "jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
}

/** Signed VAPID JWT scoped to one push service origin. */
async function vapidJwt(audience: string): Promise<string> {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: VAPID_SUBJECT,
  })));
  const signingInput = `${header}.${claims}`;
  const key = await importVapidKey();
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

/**
 * Wake every registered browser. Best effort: a dead endpoint is pruned, and
 * no failure here is allowed to fail the agent run that triggered it.
 */
export async function sendPushToAll(sb: SupabaseClient): Promise<{ sent: number; pruned: number }> {
  if (!pushConfigured()) return { sent: 0, pruned: 0 };

  const { data: subs } = await sb.from("push_subscriptions").select("id, endpoint");
  if (!subs?.length) return { sent: 0, pruned: 0 };

  let sent = 0;
  const dead: string[] = [];

  await Promise.all(subs.map(async (sub) => {
    try {
      const aud = new URL(sub.endpoint).origin;
      const jwt = await vapidJwt(aud);
      const res = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC}`,
          TTL: "86400",
          // No body, so no Content-Encoding and Content-Length must be 0.
          "Content-Length": "0",
          Urgency: "normal",
        },
      });
      // 404/410 mean the browser unsubscribed or the endpoint expired.
      if (res.status === 404 || res.status === 410) dead.push(sub.id);
      else if (res.ok) sent++;
      else console.warn("push failed", res.status, await res.text().catch(() => ""));
    } catch (e) {
      console.warn("push error", String((e as Error).message || e));
    }
  }));

  if (dead.length) await sb.from("push_subscriptions").delete().in("id", dead);
  return { sent, pruned: dead.length };
}
