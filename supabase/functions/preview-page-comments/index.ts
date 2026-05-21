// Public per-page comments for external-URL previews.
// GET ?slug=...&path=... -> list comments
// POST { slug, path, author_name, body } -> add a comment
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const slug = url.searchParams.get("slug");
      const path = url.searchParams.get("path") || "";
      if (!slug) return json({ error: "slug required" }, 400);
      const { data: project } = await admin
        .from("preview_projects")
        .select("id, archived")
        .eq("slug", slug)
        .maybeSingle();
      if (!project || project.archived) return json({ error: "not found" }, 404);
      const { data: comments } = await admin
        .from("preview_page_comments")
        .select("id, author_name, body, created_at")
        .eq("project_id", project.id)
        .eq("path", path)
        .order("created_at", { ascending: true });
      return json({ comments: comments ?? [] });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const slug = String(body.slug || "");
      const path = String(body.path ?? "");
      const author = body.author_name ? String(body.author_name).slice(0, 120) : null;
      const text = String(body.body || "").trim();
      if (!slug || !text) return json({ error: "missing fields" }, 400);
      if (text.length > 4000) return json({ error: "too long" }, 400);

      const { data: project } = await admin
        .from("preview_projects")
        .select("id, archived, feedback_enabled")
        .eq("slug", slug)
        .maybeSingle();
      if (!project || project.archived || !project.feedback_enabled) {
        return json({ error: "not found" }, 404);
      }
      const { data, error } = await admin
        .from("preview_page_comments")
        .insert({ project_id: project.id, path, author_name: author, body: text })
        .select("id, author_name, body, created_at")
        .single();
      if (error) throw error;
      return json({ ok: true, comment: data });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "server error" }, 500);
  }
});
