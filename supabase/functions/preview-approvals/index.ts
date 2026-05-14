// Public endpoints for client-side preview approvals.
// Actions: list | approve | unapprove
// Lookup is by preview slug (no admin auth required).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isPagePath = (p: string) => /\.html?$/i.test(p);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const payload = await req.json();
    const action = String(payload.action || "");
    const slug = payload.slug ? String(payload.slug) : null;
    const clientProjectId = payload.client_project_id ? String(payload.client_project_id) : null;
    if (!slug && !clientProjectId) return json({ error: "slug or client_project_id required" }, 400);

    const q = admin.from("preview_projects").select("id, slug, name, entry_path, archived");
    const { data: project } = await (slug
      ? q.eq("slug", slug).maybeSingle()
      : q.eq("client_project_id", clientProjectId!).maybeSingle());
    if (!project || project.archived) return json({ error: "not found" }, 404);

    if (action === "list") {
      const { data: files } = await admin
        .from("preview_files")
        .select("path")
        .eq("project_id", project.id)
        .order("path");
      const { data: approvals } = await admin
        .from("preview_approvals")
        .select("kind, path, approver_name, approved_at")
        .eq("project_id", project.id);

      const approvalMap = new Map<string, { approver_name: string | null; approved_at: string }>();
      for (const a of approvals ?? []) approvalMap.set(`${a.kind}:${a.path}`, { approver_name: a.approver_name, approved_at: a.approved_at });

      const pages: any[] = [];
      const assets: any[] = [];
      for (const f of files ?? []) {
        const p = f.path as string;
        if (isPagePath(p)) {
          pages.push({ path: p, isEntry: p === project.entry_path, approval: approvalMap.get(`page:${p}`) ?? null });
        } else {
          assets.push({ path: p, approval: approvalMap.get(`asset:${p}`) ?? null });
        }
      }
      return json({ project: { id: project.id, name: project.name, slug: project.slug, entry_path: project.entry_path }, pages, assets });
    }

    if (action === "approve" || action === "unapprove") {
      const kind = String(payload.kind || "");
      const path = String(payload.path || "");
      if (!["page", "asset"].includes(kind)) return json({ error: "invalid kind" }, 400);
      if (!path) return json({ error: "path required" }, 400);

      // Verify the path belongs to this project
      const { data: file } = await admin
        .from("preview_files")
        .select("path")
        .eq("project_id", project.id)
        .eq("path", path)
        .maybeSingle();
      if (!file) return json({ error: "file not found" }, 404);

      if (action === "approve") {
        const approver_name = (payload.approver_name ? String(payload.approver_name).slice(0, 120) : null) || null;
        const { error } = await admin
          .from("preview_approvals")
          .upsert(
            { project_id: project.id, kind, path, approver_name, approved_at: new Date().toISOString() },
            { onConflict: "project_id,kind,path" },
          );
        if (error) throw error;
        return json({ ok: true });
      } else {
        const { error } = await admin
          .from("preview_approvals")
          .delete()
          .eq("project_id", project.id)
          .eq("kind", kind)
          .eq("path", path);
        if (error) throw error;
        return json({ ok: true });
      }
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "server error" }, 500);
  }
});
