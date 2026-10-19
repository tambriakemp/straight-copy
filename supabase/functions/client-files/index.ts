// Files on a project, for the portal and for the admin.
//
// The bucket is PRIVATE, which is the whole point: the portal is reached
// by a link, and a link that also hands out permanent file URLs turns
// one leaked address into a permanent document archive. So reads come
// through here as short-lived signed URLs, minted per request.
//
// Two callers, one endpoint:
//   - the portal, scoped to one client and one project, now requiring a
//     real portal session for that client (CRE-536 — it used to be
//     anonymous, trusting client_id alone). It may list what is
//     visible, record a file it just uploaded, and delete one it sent
//     itself.
//   - the admin, with a bearer token that is checked against is_admin.
//     It may do all of that plus share a file TO the client and hide one.
//
// The client may never delete a file we shared with them, and may never
// see one marked not visible. Both are decided here rather than in the
// browser, because the browser is the thing we do not control.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolvePortalCaller } from "../_shared/webhook-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const BUCKET = "client-assets";
const PREFIX = "project-files";
/** Long enough to click, short enough that a copied URL stops working. */
const SIGNED_SECONDS = 60 * 30;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** True only for a signed-in admin. An anonymous caller is not an error. */
// deno-lint-ignore no-explicit-any
async function callerIsAdmin(req: Request, admin: any): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  // The publishable key is what the portal sends; it is not a user.
  if (!token || token === ANON_KEY) return false;
  try {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data } = await userClient.auth.getUser();
    if (!data.user) return false;
    const { data: ok } = await admin.rpc("is_admin", { _user_id: data.user.id });
    return !!ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const action = String(payload.action ?? "").trim();
  const clientId = String(payload.client_id ?? "").trim();
  const projectId = payload.client_project_id ? String(payload.client_project_id).trim() : null;
  if (!clientId) return json({ error: "client_id required" }, 400);

  const isAdmin = await callerIsAdmin(req, admin);
  if (!isAdmin) {
    const caller = await resolvePortalCaller(req, clientId);
    if (caller.kind === "unauthorized") return json({ error: "Unauthorized" }, 401);
  }

  try {
    if (action === "list") {
      let q = admin.from("client_project_files")
        .select("id, name, storage_path, size_bytes, mime, direction, category, uploaded_by_name, visible_to_client, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      if (projectId) q = q.eq("client_project_id", projectId);
      // Hidden files are ours, not theirs. Filtered server-side, because
      // "the browser will not render it" is not a access control.
      if (!isAdmin) q = q.eq("visible_to_client", true);
      const { data, error } = await q;
      if (error) throw error;

      const rows = data ?? [];
      // One signed URL per file, minted now and good for half an hour.
      const paths = rows.map((r) => r.storage_path as string);
      const signed = new Map<string, string>();
      if (paths.length) {
        const { data: urls } = await admin.storage.from(BUCKET)
          .createSignedUrls(paths, SIGNED_SECONDS);
        for (const u of urls ?? []) {
          if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
        }
      }
      return json({
        files: rows.map((r) => ({ ...r, url: signed.get(r.storage_path as string) ?? null })),
        isAdmin,
      });
    }

    if (action === "register") {
      const name = String(payload.name ?? "").trim();
      const storagePath = String(payload.storage_path ?? "").trim();
      if (!name || !storagePath) return json({ error: "name and storage_path required" }, 400);

      // The path has to be the one this caller was allowed to write.
      // Without this check a caller could register any object in the
      // bucket as their own file and have us sign it for them.
      const expected = `${PREFIX}/${clientId}/${projectId ?? "general"}/`;
      if (!storagePath.startsWith(expected)) {
        return json({ error: "storage_path is not under this project" }, 400);
      }

      // Only an admin may say a file came FROM us, or hide one.
      const direction = isAdmin && payload.direction === "to_client" ? "to_client" : "from_client";
      const visible = isAdmin && payload.visible_to_client === false ? false : true;

      const { data, error } = await admin.from("client_project_files").insert({
        client_id: clientId,
        client_project_id: projectId,
        name: name.slice(0, 300),
        storage_path: storagePath,
        size_bytes: payload.size_bytes != null ? Number(payload.size_bytes) : null,
        mime: payload.mime ? String(payload.mime).slice(0, 200) : null,
        direction,
        category: payload.category ? String(payload.category).slice(0, 120) : null,
        uploaded_by_name: payload.uploaded_by_name ? String(payload.uploaded_by_name).slice(0, 160) : null,
        visible_to_client: visible,
      }).select("id").single();
      if (error) throw error;
      return json({ ok: true, id: data.id });
    }

    if (action === "remove") {
      const id = String(payload.id ?? "").trim();
      if (!id) return json({ error: "id required" }, 400);
      const { data: row } = await admin.from("client_project_files")
        .select("id, client_id, direction, storage_path")
        .eq("id", id).eq("client_id", clientId).maybeSingle();
      if (!row) return json({ error: "not found" }, 404);
      // A client may take back what they sent. What we shared with them
      // is ours to withdraw, not theirs.
      if (!isAdmin && row.direction !== "from_client") {
        return json({ error: "that file was shared by Cre8 Visions" }, 403);
      }
      await admin.storage.from(BUCKET).remove([row.storage_path as string]);
      const { error } = await admin.from("client_project_files").delete().eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "set_visible") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const id = String(payload.id ?? "").trim();
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await admin.from("client_project_files")
        .update({ visible_to_client: payload.visible_to_client !== false })
        .eq("id", id).eq("client_id", clientId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "action must be list, register, remove or set_visible" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "server error" }, 500);
  }
});
