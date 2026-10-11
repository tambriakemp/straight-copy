// Admin-only endpoint for the client page's Logins tab.
//
// Passwords are encrypted at rest with pgp_sym_encrypt, exactly as
// project_secrets does it: set_client_login / get_client_login are
// SECURITY DEFINER and granted to service_role only, so the symmetric key
// lives here — in PROJECT_SECRETS_KEY, the same one add-project-secret
// already uses — and never reaches the database at rest or the browser.
//
// Listing is NOT done here. The browser reads client_logins_list directly
// under RLS, which gives it everything except the ciphertext (the SELECT
// privilege on that column is revoked from `authenticated`). Only the
// three things that need the key come through this function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENC_KEY = Deno.env.get("PROJECT_SECRETS_KEY") ?? "";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!ENC_KEY) return json({ error: "server misconfigured: PROJECT_SECRETS_KEY missing" }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  if (!userRes.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: userRes.user.id });
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const action = String(payload.action ?? "").trim();

  if (action === "upsert") {
    const clientId = String(payload.client_id ?? "").trim();
    const id = payload.id ? String(payload.id).trim() : null;
    const label = String(payload.label ?? "").trim();
    const url = payload.url ? String(payload.url).trim() : null;
    const username = payload.username ? String(payload.username).trim() : null;
    // Empty means "leave the stored one alone" — the edit form never shows
    // the current password, so an untouched form must not wipe it.
    const password = payload.password != null ? String(payload.password) : "";
    const note = payload.note ? String(payload.note).slice(0, 2000) : null;

    if (!clientId) return json({ error: "client_id required" }, 400);
    if (!label) return json({ error: "label required" }, 400);
    if (password.length > 4096) return json({ error: "password too long (max 4096)" }, 400);
    if (url) {
      try {
        const u = new URL(url);
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
      } catch { return json({ error: "sign-in link is not a valid URL" }, 400); }
    }

    const { data, error } = await admin.rpc("set_client_login", {
      _id: id,
      _client_id: clientId,
      _label: label,
      _url: url,
      _username: username,
      _password: password,
      _note: note,
      _created_by: userRes.user.id,
      _enc_key: ENC_KEY,
    });
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "login not found for this client" }, 404);
    return json({ ok: true, id: data });
  }

  if (action === "reveal") {
    const id = String(payload.id ?? "").trim();
    if (!id) return json({ error: "id required" }, 400);
    const { data, error } = await admin.rpc("get_client_login", { _id: id, _enc_key: ENC_KEY });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, password: data ?? null });
  }

  if (action === "delete") {
    const id = String(payload.id ?? "").trim();
    const clientId = String(payload.client_id ?? "").trim();
    if (!id || !clientId) return json({ error: "id and client_id required" }, 400);
    // Scoped by client as well as id: an id alone would let a mistyped
    // request delete another client's login.
    const { error } = await admin.from("client_logins").delete().eq("id", id).eq("client_id", clientId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "action must be upsert, reveal or delete" }, 400);
});
