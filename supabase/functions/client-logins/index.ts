// The client page's Logins tab, and the portal's.
//
// Passwords are encrypted at rest with pgp_sym_encrypt, exactly as
// project_secrets does it: set_client_login / get_client_login are
// SECURITY DEFINER and granted to service_role only, so the symmetric key
// lives here — in PROJECT_SECRETS_KEY, the same one add-project-secret
// already uses — and never reaches the database at rest or the browser.
//
// Listing is NOT done here for the ADMIN. The admin browser reads
// client_logins_list directly under RLS, which gives it everything
// except the ciphertext (the SELECT privilege on that column is revoked
// from `authenticated`). Only the things that need the key come through
// this function.
//
// The PORTAL has no session, so its four actions are here, before the
// admin gate, and they are deliberately narrower:
//
//   * every one is scoped to a client AND a project, so a portal link
//     can only ever reach the logins shared for that project. A login
//     the agency holds for the client as a whole has no project on it
//     and is unreachable from the portal entirely.
//   * there is no portal reveal. A portal URL is a link, and a link that
//     reads back the client's own third-party passwords turns one
//     forwarded email into a credential dump. The client can replace a
//     password; they cannot ask us to read one back to them.
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

  let early: Record<string, unknown>;
  try { early = await req.clone().json(); } catch { return json({ error: "invalid json" }, 400); }
  const earlyAction = String(early.action ?? "").trim();

  if (earlyAction.startsWith("portal_")) {
    return await handlePortal(earlyAction, early);
  }

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
      _client_project_id: payload.client_project_id ? String(payload.client_project_id) : null,
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

  if (action === "reorder") {
    const clientId = String(payload.client_id ?? "").trim();
    const ids = Array.isArray(payload.ids) ? payload.ids.map(String) : [];
    if (!clientId || !ids.length) return json({ error: "client_id and ids required" }, 400);
    // Position is the index in the array the tab sends. Every id is scoped
    // to the client, so a stray id in the list cannot touch another
    // client's rows.
    for (let i = 0; i < ids.length; i++) {
      const { error } = await admin.from("client_logins")
        .update({ sort_order: i + 1 })
        .eq("id", ids[i]).eq("client_id", clientId);
      if (error) return json({ error: error.message }, 500);
    }
    return json({ ok: true });
  }

  return json({ error: "action must be upsert, reveal, delete or reorder" }, 400);
});

/**
 * The portal's three actions.
 *
 * Every one is scoped to a client AND a project. A row with no project
 * on it is the agency's own record of that client's accounts and is
 * unreachable from here — which is the line between "the client shared
 * this with us" and "we hold this about the client".
 *
 * There is no reveal. See the note at the top of the file.
 */
async function handlePortal(action: string, payload: Record<string, unknown>): Promise<Response> {
  if (!ENC_KEY) return json({ error: "server misconfigured: PROJECT_SECRETS_KEY missing" }, 500);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const clientId = String(payload.client_id ?? "").trim();
  const projectId = String(payload.client_project_id ?? "").trim();
  if (!clientId || !projectId) return json({ error: "client_id and client_project_id required" }, 400);

  // The project must belong to the client in the link. Without this an
  // id from one client's portal could name another client's project.
  const { data: proj } = await admin.from("client_projects")
    .select("id").eq("id", projectId).eq("client_id", clientId).maybeSingle();
  if (!proj) return json({ error: "not found" }, 404);

  if (action === "portal_list") {
    const { data, error } = await admin.from("client_logins")
      .select("id, label, url, username, note, created_at, updated_at, encrypted_password")
      .eq("client_id", clientId).eq("client_project_id", projectId)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) return json({ error: error.message }, 500);
    return json({
      ok: true,
      logins: (data ?? []).map((l) => ({
        id: l.id, label: l.label, url: l.url, username: l.username, note: l.note,
        created_at: l.created_at, updated_at: l.updated_at,
        // The flag, never the bytes.
        has_password: l.encrypted_password != null,
      })),
    });
  }

  if (action === "portal_upsert") {
    const id = payload.id ? String(payload.id).trim() : null;
    const label = String(payload.label ?? "").trim();
    const url = payload.url ? String(payload.url).trim() : null;
    const username = payload.username ? String(payload.username).trim() : null;
    const password = payload.password != null ? String(payload.password) : "";
    const note = payload.note ? String(payload.note).slice(0, 2000) : null;

    if (!label) return json({ error: "label required" }, 400);
    if (password.length > 4096) return json({ error: "password too long (max 4096)" }, 400);
    if (url) {
      try {
        const u = new URL(url);
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("scheme");
      } catch { return json({ error: "sign-in link is not a valid URL" }, 400); }
    }
    // An edit has to name a row that is already this project's, or the
    // portal could rewrite a login the agency holds.
    if (id) {
      const { data: own } = await admin.from("client_logins")
        .select("id").eq("id", id).eq("client_id", clientId).eq("client_project_id", projectId).maybeSingle();
      if (!own) return json({ error: "not found" }, 404);
    }

    const { data, error } = await admin.rpc("set_client_login", {
      _id: id,
      _client_id: clientId,
      _label: label,
      _url: url,
      _username: username,
      _password: password,
      _note: note,
      _created_by: null,
      _enc_key: ENC_KEY,
      _client_project_id: projectId,
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id: data });
  }

  if (action === "portal_delete") {
    const id = String(payload.id ?? "").trim();
    if (!id) return json({ error: "id required" }, 400);
    const { error } = await admin.from("client_logins")
      .delete().eq("id", id).eq("client_id", clientId).eq("client_project_id", projectId);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "action must be portal_list, portal_upsert or portal_delete" }, 400);
}
