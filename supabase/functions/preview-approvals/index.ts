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

    const q = admin.from("preview_projects").select("id, slug, name, entry_path, archived, source_type, external_base_url");
    const { data: project } = await (slug
      ? q.eq("slug", slug).maybeSingle()
      : q.eq("client_project_id", clientProjectId!).maybeSingle());
    if (!project || project.archived) return json({ error: "not found" }, 404);

    const hasExternal = !!project.external_base_url;
    const extBase = (project.external_base_url || "").replace(/\/+$/, "");

    if (action === "list") {
      const { data: approvals } = await admin
        .from("preview_approvals")
        .select("kind, path, approver_name, approved_at")
        .eq("project_id", project.id);
      const approvalMap = new Map<string, { approver_name: string | null; approved_at: string }>();
      for (const a of approvals ?? []) approvalMap.set(`${a.kind}:${a.path}`, { approver_name: a.approver_name, approved_at: a.approved_at });

      const pages: any[] = [];
      const assets: any[] = [];

      // Uploaded files (always include if present)
      const { data: files } = await admin
        .from("preview_files")
        .select("path")
        .eq("project_id", project.id)
        .order("path");
      for (const f of files ?? []) {
        const p = f.path as string;
        if (isPagePath(p)) {
          pages.push({
            path: p, label: null, isEntry: p === project.entry_path,
            isExternal: false, viewUrl: null,
            approval: approvalMap.get(`page:${p}`) ?? null,
          });
        } else {
          assets.push({ path: p, approval: approvalMap.get(`asset:${p}`) ?? null });
        }
      }

      // External pages (if a link is configured)
      if (hasExternal) {
        const { data: extPages } = await admin
          .from("preview_external_pages")
          .select("path, label, order_index")
          .eq("project_id", project.id)
          .order("order_index", { ascending: true });
        for (const p of extPages ?? []) {
          pages.push({
            path: p.path, label: p.label, isEntry: false,
            isExternal: true, viewUrl: `${extBase}${p.path}`,
            approval: approvalMap.get(`page:${p.path}`) ?? null,
          });
        }
      }

      return json({
        project: {
          id: project.id, name: project.name, slug: project.slug, entry_path: project.entry_path,
          source_type: project.source_type, external_base_url: project.external_base_url,
          has_external: hasExternal,
        },
        pages, assets,
      });
    }

    if (action === "events") {
      const { data: events } = await admin
        .from("preview_approval_events")
        .select("kind, path, action, approver_name, created_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: false })
        .limit(500);
      return json({ events: events ?? [] });
    }

    if (action === "approve" || action === "unapprove") {
      const kind = String(payload.kind || "");
      const path = String(payload.path || "");
      if (!["page", "asset"].includes(kind)) return json({ error: "invalid kind" }, 400);
      if (!path) return json({ error: "path required" }, 400);

      // Verify path exists: check external pages first, then uploaded files
      let found = false;
      if (kind === "page" && hasExternal) {
        const { data: ext } = await admin
          .from("preview_external_pages")
          .select("path").eq("project_id", project.id).eq("path", path).maybeSingle();
        if (ext) found = true;
      }
      if (!found) {
        const { data: file } = await admin
          .from("preview_files")
          .select("path").eq("project_id", project.id).eq("path", path).maybeSingle();
        if (file) found = true;
      }
      if (!found) return json({ error: "path not found" }, 404);


      const approver_name = (payload.approver_name ? String(payload.approver_name).slice(0, 120) : null) || null;

      if (action === "approve") {
        const { error } = await admin
          .from("preview_approvals")
          .upsert(
            { project_id: project.id, kind, path, approver_name, approved_at: new Date().toISOString() },
            { onConflict: "project_id,kind,path" },
          );
        if (error) throw error;
        await admin.from("preview_approval_events").insert({
          project_id: project.id, kind, path, action: "approve", approver_name,
        });
        return json({ ok: true });
      } else {
        const { error } = await admin
          .from("preview_approvals")
          .delete()
          .eq("project_id", project.id)
          .eq("kind", kind)
          .eq("path", path);
        if (error) throw error;
        await admin.from("preview_approval_events").insert({
          project_id: project.id, kind, path, action: "unapprove", approver_name,
        });
        return json({ ok: true });
      }
    }



    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "server error" }, 500);
  }
});
