// Public endpoint behind the /audit/:slug page (CRE-225). Two calls:
//
//   POST { slug, password } -> { token }          (rate-limited, 5/15min per slug+ip)
//   GET  ?slug=&token=       -> report.html         (noindex, no-store)
//
// `token` is a short-lived HMAC-signed value (`<payload>.<sig>`, both
// base64url), not a server-side session table — same shape as a JWT but
// hand-rolled since this doesn't need the rest of a JWT library. Signed with
// app_secrets.audit_token_signing_secret, a second dashboard-managed secret
// alongside audit_upload_secret (see the migration for why both are seeded
// there rather than as Supabase Function env vars).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function b64url(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

const TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // a few hours — long enough that a reset mid-session doesn't force-invalidate it

async function issueToken(slug: string, secret: string): Promise<string> {
  const payload = JSON.stringify({ slug, exp: Date.now() + TOKEN_TTL_MS });
  const payloadB64 = b64url(new TextEncoder().encode(payload));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${b64url(new Uint8Array(sig))}`;
}

async function verifyToken(token: string, slug: string, secret: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC", key, b64urlDecode(sigB64), new TextEncoder().encode(payloadB64),
    );
    if (!ok) return false;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
    return payload.slug === slug && typeof payload.exp === "number" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = serviceClient();

  if (req.method === "POST") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "body must be valid JSON" }, 400);
    }
    const { slug, password } = body as { slug?: string; password?: string };
    if (!slug || typeof password !== "string") return json({ error: "slug and password required" }, 400);

    const ip = getClientIp(req);
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count } = await sb
      .from("audit_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("slug", slug).eq("ip", ip).gte("attempted_at", since);
    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      return json({ error: "Too many attempts. Try again later." }, 429);
    }

    const { data: row } = await sb
      .from("client_audits").select("password, status, storage_path").eq("slug", slug).maybeSingle();

    if (!row || row.password !== password) {
      await sb.from("audit_login_attempts").insert({ slug, ip });
      return json({ error: "Incorrect password" }, 401);
    }
    if (row.status !== "ready" || !row.storage_path) {
      return json({ error: "Report not ready yet" }, 404);
    }

    const { data: signSecret } = await sb
      .from("app_secrets").select("value").eq("key", "audit_token_signing_secret").maybeSingle();
    if (!signSecret?.value) return json({ error: "Server not configured" }, 500);

    const token = await issueToken(slug, signSecret.value);
    return json({ token });
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const token = url.searchParams.get("token");
    if (!slug || !token) return new Response("missing slug or token", { status: 400, headers: corsHeaders });

    const { data: signSecret } = await sb
      .from("app_secrets").select("value").eq("key", "audit_token_signing_secret").maybeSingle();
    if (!signSecret?.value || !(await verifyToken(token, slug, signSecret.value))) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const { data: row } = await sb
      .from("client_audits").select("status, storage_path").eq("slug", slug).maybeSingle();
    if (!row || row.status !== "ready" || !row.storage_path) {
      return new Response("Not found", { status: 404, headers: corsHeaders });
    }

    const { data: file, error } = await sb.storage.from("audit-reports").download(row.storage_path);
    if (error || !file) return new Response("Not found", { status: 404, headers: corsHeaders });

    return new Response(await file.text(), {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  return json({ error: "GET or POST only" }, 405);
});
