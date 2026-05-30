// OAuth 2.1 authorization server for the Project Tasks MCP.
// Endpoints (all under /functions/v1/mcp-oauth):
//   GET  /.well-known/oauth-authorization-server
//   GET  /.well-known/oauth-protected-resource
//   POST /register                  (RFC 7591 Dynamic Client Registration)
//   GET  /authorize                 (renders consent + login HTML)
//   POST /authorize                 (verifies email/password, issues code, 302s back)
//   POST /token                     (exchanges code+PKCE for access_token)
import { Hono } from "hono";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const PROJECT_ORIGIN = new URL(SUPABASE_URL).origin;
const BASE = `${PROJECT_ORIGIN}/functions/v1/mcp-oauth`;
const MCP_URL = `${PROJECT_ORIGIN}/functions/v1/agency-mcp`;
const APP_ORIGIN = Deno.env.get("MCP_OAUTH_APP_ORIGIN") ?? "https://id-preview--3041a012-dbf6-44ce-a5eb-1891a44da04b.lovable.app";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function svc() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

async function sha256hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64url(bytes: Uint8Array) {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return b64url(buf);
}

async function pkceVerify(verifier: string, challenge: string, method: string) {
  if (method === "plain") return verifier === challenge;
  if (method !== "S256") return false;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return b64url(digest) === challenge;
}

const app = new Hono().basePath("/mcp-oauth");

app.options("/*", (c) => new Response(null, { headers: cors }));

const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", ...extra },
  });

// ---------- discovery ----------
const metadata = () => ({
  issuer: BASE,
  authorization_endpoint: `${BASE}/authorize`,
  token_endpoint: `${BASE}/token`,
  registration_endpoint: `${BASE}/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  code_challenge_methods_supported: ["S256", "plain"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: ["mcp"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["none"],
});

app.get("/.well-known/oauth-authorization-server", () => json(metadata()));
// Claude's connector probes OIDC discovery too — serve the same payload.
app.get("/.well-known/openid-configuration", () => json(metadata()));

app.get("/.well-known/oauth-protected-resource", () =>
  json({
    resource: MCP_URL,
    authorization_servers: [BASE],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  })
);

// ---------- dynamic client registration ----------
app.post("/register", async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return json({ error: "invalid_request" }, 400); }
  const redirect_uris: string[] = Array.isArray(body?.redirect_uris) ? body.redirect_uris : [];
  if (redirect_uris.length === 0) return json({ error: "invalid_redirect_uri" }, 400);
  const client_id = `mcp_${randomToken(12)}`;
  const sb = svc();
  const { error } = await sb.from("mcp_oauth_clients").insert({
    client_id,
    client_name: body?.client_name ?? null,
    redirect_uris,
    token_endpoint_auth_method: body?.token_endpoint_auth_method ?? "none",
    grant_types: body?.grant_types ?? ["authorization_code"],
    response_types: body?.response_types ?? ["code"],
    scope: body?.scope ?? "mcp",
    metadata: body ?? {},
  });
  if (error) return json({ error: "server_error", error_description: error.message }, 500);
  return json({
    client_id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
    scope: "mcp",
  }, 201);
});

// ---------- authorize (GET = app-hosted consent UI) ----------
function appAuthorizeUrl(params: Record<string, string | null | undefined>) {
  const dest = new URL("/admin/mcp-authorize", APP_ORIGIN);
  for (const [key, value] of Object.entries(params)) {
    if (value) dest.searchParams.set(key, value);
  }
  return dest.toString();
}

function redirectToApp(params: Record<string, string | null | undefined>) {
  return new Response(null, { status: 302, headers: { Location: appAuthorizeUrl(params), ...cors } });
}

function consentHtml(params: {
  client_id: string;
  client_name: string | null;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  error?: string;
}) {
  const safe = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const hidden = (k: string, v: string) => `<input type="hidden" name="${k}" value="${safe(v)}" />`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Connect ${safe(params.client_name ?? "MCP client")}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:#0c0a08; color:#f5f0e8; }
  .card { background:#171411; border:1px solid #2a2520; border-radius:12px; padding:32px; width:min(440px,92vw); }
  h1 { font-family:"Cormorant Garamond",Georgia,serif; font-weight:400; font-size:26px; margin:0 0 6px; }
  p { color:#a09587; margin:0 0 20px; font-size:14px; line-height:1.5; }
  label { display:block; font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#7a7066; margin-bottom:6px; }
  input { width:100%; box-sizing:border-box; background:transparent; border:1px solid #3a342d; color:#f5f0e8; padding:10px 12px; border-radius:6px; font-size:14px; margin-bottom:14px; }
  input:focus { outline:none; border-color:#b8a888; }
  button { width:100%; background:#d4c4a8; color:#0c0a08; border:0; padding:11px; border-radius:6px; font-size:14px; font-weight:500; cursor:pointer; letter-spacing:0.04em; }
  button:hover { background:#e2d4b8; }
  .err { background:#3a1f1f; border:1px solid #6a3030; color:#f5c8c8; padding:10px 12px; border-radius:6px; font-size:13px; margin-bottom:16px; }
  .scope { font-size:12px; color:#7a7066; margin-top:18px; padding-top:14px; border-top:1px solid #2a2520; }
</style></head>
<body>
<form class="card" method="post" action="${BASE}/authorize">
  <h1>${safe(params.client_name ?? "Custom MCP client")}</h1>
  <p>is requesting access to your Project Tasks workspace. Sign in with your admin account to approve.</p>
  ${params.error ? `<div class="err">${safe(params.error)}</div>` : ""}
  <label>Email</label><input name="email" type="email" required autofocus />
  <label>Password</label><input name="password" type="password" required />
  ${hidden("client_id", params.client_id)}
  ${hidden("redirect_uri", params.redirect_uri)}
  ${hidden("state", params.state)}
  ${hidden("code_challenge", params.code_challenge)}
  ${hidden("code_challenge_method", params.code_challenge_method)}
  ${hidden("scope", params.scope)}
  <button type="submit">Approve and connect</button>
  <div class="scope">Grants scope: <code>${safe(params.scope || "mcp")}</code></div>
</form></body></html>`;
}

app.get("/authorize", async (c) => {
  const u = new URL(c.req.url);
  const client_id = u.searchParams.get("client_id") ?? "";
  const redirect_uri = u.searchParams.get("redirect_uri") ?? "";
  const state = u.searchParams.get("state") ?? "";
  const code_challenge = u.searchParams.get("code_challenge") ?? "";
  const code_challenge_method = u.searchParams.get("code_challenge_method") ?? "S256";
  const scope = u.searchParams.get("scope") ?? "mcp";
  const response_type = u.searchParams.get("response_type") ?? "code";

  const passthrough = { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope };
  if (response_type !== "code") return redirectToApp({ ...passthrough, error: "Unsupported OAuth response type." });
  if (!client_id || !redirect_uri || !code_challenge) return redirectToApp({ ...passthrough, error: "Missing OAuth authorization details." });

  const sb = svc();
  const { data: client } = await sb.from("mcp_oauth_clients").select("client_name, redirect_uris").eq("client_id", client_id).maybeSingle();
  if (!client) return redirectToApp({ ...passthrough, error: "Unknown OAuth client. Try adding the connector again in Claude." });
  if (!client.redirect_uris.includes(redirect_uri)) return redirectToApp({ ...passthrough, error: "Invalid OAuth redirect URL." });

  return redirectToApp({ ...passthrough, client_name: client.client_name ?? "Claude" });
});

app.post("/authorize", async (c) => {
  const form = await c.req.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const client_id = String(form.get("client_id") ?? "");
  const redirect_uri = String(form.get("redirect_uri") ?? "");
  const state = String(form.get("state") ?? "");
  const code_challenge = String(form.get("code_challenge") ?? "");
  const code_challenge_method = String(form.get("code_challenge_method") ?? "S256");
  const scope = String(form.get("scope") ?? "mcp");

  const sb = svc();
  const { data: client } = await sb.from("mcp_oauth_clients").select("client_name, redirect_uris").eq("client_id", client_id).maybeSingle();
  if (!client || !client.redirect_uris.includes(redirect_uri)) return new Response("invalid_request", { status: 400 });

  const renderErr = (msg: string) => redirectToApp({
    client_id, client_name: client.client_name, redirect_uri, state,
    code_challenge, code_challenge_method, scope, error: msg,
  });

  // Verify credentials using anon client (no session persistence).
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await anon.auth.signInWithPassword({ email, password });
  if (authErr || !auth?.user) return renderErr("Invalid email or password.");

  // Admin gate.
  const { data: isAdmin } = await sb.rpc("is_admin", { _user_id: auth.user.id });
  if (!isAdmin) return renderErr("This account is not authorized as an admin.");

  // Issue code.
  const code = randomToken(24);
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error: insErr } = await sb.from("mcp_oauth_codes").insert({
    code, client_id, redirect_uri, code_challenge, code_challenge_method,
    user_id: auth.user.id, scope, expires_at,
  });
  if (insErr) return renderErr(`Server error: ${insErr.message}`);

  const dest = new URL(redirect_uri);
  dest.searchParams.set("code", code);
  if (state) dest.searchParams.set("state", state);
  return new Response(null, { status: 302, headers: { Location: dest.toString() } });
});

// ---------- token ----------
app.post("/token", async (c) => {
  let params: URLSearchParams;
  const ct = c.req.header("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = await c.req.json().catch(() => ({}));
    params = new URLSearchParams(body as Record<string, string>);
  } else {
    params = new URLSearchParams(await c.req.text());
  }
  const grant_type = params.get("grant_type");
  if (grant_type !== "authorization_code") return json({ error: "unsupported_grant_type" }, 400);

  const code = params.get("code") ?? "";
  const client_id = params.get("client_id") ?? "";
  const redirect_uri = params.get("redirect_uri") ?? "";
  const code_verifier = params.get("code_verifier") ?? "";
  if (!code || !client_id || !redirect_uri || !code_verifier) return json({ error: "invalid_request" }, 400);

  const sb = svc();
  const { data: row } = await sb.from("mcp_oauth_codes").select("*").eq("code", code).maybeSingle();
  if (!row) return json({ error: "invalid_grant" }, 400);
  if (row.used) return json({ error: "invalid_grant", error_description: "code already used" }, 400);
  if (new Date(row.expires_at).getTime() < Date.now()) return json({ error: "invalid_grant", error_description: "code expired" }, 400);
  if (row.client_id !== client_id) return json({ error: "invalid_grant" }, 400);
  if (row.redirect_uri !== redirect_uri) return json({ error: "invalid_grant" }, 400);

  const ok = await pkceVerify(code_verifier, row.code_challenge, row.code_challenge_method);
  if (!ok) return json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);

  await sb.from("mcp_oauth_codes").update({ used: true }).eq("code", code);

  const access_token = `oat_${randomToken(36)}`;
  const expiresInSec = 30 * 24 * 60 * 60;
  const hash = await sha256hex(access_token);
  const { error: tErr } = await sb.from("mcp_oauth_tokens").insert({
    token_hash: hash,
    client_id,
    user_id: row.user_id,
    scope: row.scope,
    expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
  });
  if (tErr) return json({ error: "server_error", error_description: tErr.message }, 500);

  return json({
    access_token,
    token_type: "Bearer",
    expires_in: expiresInSec,
    scope: row.scope ?? "mcp",
  }, 200, { "Cache-Control": "no-store" });
});

app.all("/*", (c) => new Response("Not found", { status: 404, headers: cors }));

Deno.serve(app.fetch);
