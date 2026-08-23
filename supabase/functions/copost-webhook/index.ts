// CoPost tells us what happened to a post.
//
// Public endpoint (verify_jwt = false) — CoPost has no Supabase JWT to send.
// Authentication is an HMAC over the raw body, the same construction
// surecart-webhook uses.
//
// ---------------------------------------------------------------------------
// THE CONTRACT IS NOT CONFIRMED YET, and this file is written to survive that.
//
// CoPost's site documents outgoing webhooks for "Post Published", "Post
// Failed" and "Post Scheduled", but the reference sits behind registration, so
// the header names, the signing construction and the field names below are a
// best guess. Rather than guess and lose what does not match, EVERY callback
// is written to social_post_events verbatim before anything is interpreted —
// so pointing CoPost at this endpoint and reading that table is how the real
// shape gets discovered.
//
// Until COPOST_WEBHOOK_SECRET is set, callbacks are logged with
// signature_valid = null and nothing is acted on. That is deliberate: acting
// on an unauthenticated callback would let anyone who guessed a post id mark
// posts published or failed.
// ---------------------------------------------------------------------------
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, " +
    "x-copost-signature, x-webhook-signature, x-webhook-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time compare, so a wrong signature leaks nothing by how long it took. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  timestampHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader) return false;
  const supplied = signatureHeader.trim().toLowerCase();

  // Both constructions in use across the webhooks this codebase already
  // receives: timestamped, and the body signed directly.
  const candidates: string[] = [];
  if (timestampHeader) {
    candidates.push(await hmacSha256Hex(secret, `${timestampHeader}.${rawBody}`));
  }
  candidates.push(await hmacSha256Hex(secret, rawBody));

  return candidates.some((c) => timingSafeEqual(c, supplied));
}

/** Map whatever CoPost calls it onto what we do about it. */
function classify(payload: Record<string, unknown>): string {
  const raw = String(
    payload.event ?? payload.event_type ?? payload.type ?? payload.status ?? "",
  ).toLowerCase();
  if (raw.includes("publish")) return "published";
  if (raw.includes("fail") || raw.includes("error")) return "failed";
  if (raw.includes("schedul")) return "scheduled";
  return raw || "unknown";
}

/** Pull the post id out, whichever of the plausible names carries it. */
function copostPostId(payload: Record<string, unknown>): string | null {
  for (const k of ["post_id", "postId", "id", "external_id"]) {
    const v = payload[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const rawBody = await req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const secret = Deno.env.get("COPOST_WEBHOOK_SECRET");
  let signatureValid: boolean | null = null;
  if (secret) {
    signatureValid = await verifySignature(
      rawBody,
      req.headers.get("x-copost-signature") ??
        req.headers.get("x-webhook-signature"),
      req.headers.get("x-webhook-timestamp"),
      secret,
    );
  }

  const event = classify(payload);
  const postId = copostPostId(payload);

  // Match the callback back to the send it belongs to. Our own schedule id may
  // come back as a passthrough field; otherwise fall back to CoPost's post id.
  const ourId = typeof payload.schedule_id === "string" ? payload.schedule_id : null;
  let schedule: { id: string; client_project_id: string; status: string } | null = null;
  if (ourId) {
    const { data } = await sb.from("social_schedule")
      .select("id, client_project_id, status").eq("id", ourId).maybeSingle();
    schedule = data ?? null;
  } else if (postId) {
    const { data } = await sb.from("social_schedule")
      .select("id, client_project_id, status").eq("copost_post_id", postId).maybeSingle();
    schedule = data ?? null;
  }

  // Logged first, always, whatever it turns out to be.
  await sb.from("social_post_events").insert({
    schedule_id: schedule?.id ?? null,
    client_project_id: schedule?.client_project_id ?? null,
    copost_post_id: postId,
    event,
    payload,
    signature_valid: signatureValid,
  });

  // A callback we cannot authenticate is recorded and then ignored. Anyone who
  // guessed a post id could otherwise mark a client's post published.
  if (signatureValid !== true) {
    return json({
      ok: true,
      recorded: true,
      acted: false,
      reason: secret ? "signature did not verify" : "no webhook secret configured",
    });
  }

  if (!schedule) {
    return json({ ok: true, recorded: true, acted: false, reason: "no matching send" });
  }

  const now = new Date().toISOString();

  if (event === "published") {
    await sb.from("social_schedule").update({
      status: "sent",
      sent_at: now,
      claimed_at: null,
      last_error: null,
      copost_post_id: postId,
    }).eq("id", schedule.id);
  } else if (event === "failed") {
    // Not retried from here. The dispatcher owns retry and its attempt count,
    // and a webhook that re-queued work would race it. Recording the failure
    // is what puts it in front of Iris on her next run.
    const message = String(
      payload.error ?? payload.message ?? payload.reason ?? "CoPost reported a failure",
    );
    await sb.from("social_schedule").update({
      status: "failed",
      claimed_at: null,
      last_error: message.slice(0, 500),
      copost_post_id: postId,
    }).eq("id", schedule.id);
  } else if (event === "scheduled" && postId) {
    // CoPost acknowledging it holds the post. Worth keeping: it is the id
    // every later callback about this post will carry.
    await sb.from("social_schedule").update({ copost_post_id: postId })
      .eq("id", schedule.id);
  }

  return json({ ok: true, recorded: true, acted: true, event });
});
