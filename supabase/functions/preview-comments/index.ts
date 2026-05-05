// Public: anonymous client posts feedback comments. GET returns existing comments for a page.
// PATCH/DELETE allow the original author to edit/remove their comment via edit_token.
// POST replies via action=reply.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const slug = url.searchParams.get("slug");
      const pagePath = url.searchParams.get("page_path") || "";
      if (!slug) return json({ error: "missing slug" }, 400);
      const { data: project } = await admin
        .from("preview_projects")
        .select("id,feedback_enabled,archived")
        .eq("slug", slug)
        .single();
      if (!project || project.archived) return json({ error: "not found" }, 404);

      const { data: comments } = await admin
        .from("preview_comments")
        .select("id,page_path,selector,x_pct,y_pct,author_name,body,status,pin_number,created_at")
        .eq("project_id", project.id)
        .eq("page_path", pagePath)
        .order("created_at", { ascending: true });

      const ids = (comments ?? []).map((c) => c.id);
      let replies: any[] = [];
      if (ids.length) {
        const { data } = await admin
          .from("preview_comment_replies")
          .select("id,comment_id,author_name,body,is_admin,created_at")
          .in("comment_id", ids)
          .order("created_at", { ascending: true });
        replies = data ?? [];
      }
      const byComment: Record<string, any[]> = {};
      for (const r of replies) (byComment[r.comment_id] ||= []).push(r);
      return json({
        comments: (comments ?? []).map((c) => ({ ...c, replies: byComment[c.id] || [] })),
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      // ----- Reply path -----
      if (body.action === "reply") {
        const { comment_id, body: text, author_name } = body;
        if (!comment_id || !text) return json({ error: "missing fields" }, 400);
        if (String(text).length > 4000) return json({ error: "too long" }, 400);
        const editToken = crypto.randomUUID();
        const { data, error } = await admin
          .from("preview_comment_replies")
          .insert({
            comment_id,
            body: text,
            author_name: author_name || "Guest",
            is_admin: false,
            edit_token: editToken,
          })
          .select("id")
          .single();
        if (error) throw error;
        return json({ ok: true, reply: data, edit_token: editToken });
      }

      // ----- New comment -----
      const { slug, page_path, selector, x_pct, y_pct, viewport_width, author_name, body: text } = body;
      if (!slug || !selector || !text) return json({ error: "missing fields" }, 400);
      if (String(text).length > 4000) return json({ error: "too long" }, 400);

      const { data: project } = await admin
        .from("preview_projects")
        .select("id,feedback_enabled,archived")
        .eq("slug", slug)
        .single();
      if (!project || project.archived || !project.feedback_enabled) return json({ error: "not found" }, 404);

      const { data: pinNum } = await admin.rpc("next_preview_pin", { _project_id: project.id });
      const editToken = crypto.randomUUID();

      const { data: inserted, error } = await admin
        .from("preview_comments")
        .insert({
          project_id: project.id,
          page_path: page_path || "index.html",
          selector,
          x_pct: Number(x_pct) || 50,
          y_pct: Number(y_pct) || 50,
          viewport_width: viewport_width ? Number(viewport_width) : null,
          author_name: author_name || "Guest",
          body: text,
          pin_number: pinNum,
          edit_token: editToken,
        })
        .select("id,pin_number")
        .single();
      if (error) throw error;
      return json({ ok: true, comment: inserted, edit_token: editToken });
    }

    if (req.method === "PATCH") {
      const body = await req.json();
      const { kind, id, edit_token, body: text } = body;
      if (!id || !edit_token || !text) return json({ error: "missing fields" }, 400);
      const table = kind === "reply" ? "preview_comment_replies" : "preview_comments";
      const { data: row } = await admin.from(table).select("id,edit_token").eq("id", id).single();
      if (!row || row.edit_token !== edit_token) return json({ error: "forbidden" }, 403);
      const { error } = await admin.from(table).update({ body: text }).eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url);
      const id = url.searchParams.get("id");
      const editToken = url.searchParams.get("edit_token");
      const kind = url.searchParams.get("kind");
      if (!id || !editToken) return json({ error: "missing fields" }, 400);
      const table = kind === "reply" ? "preview_comment_replies" : "preview_comments";
      const { data: row } = await admin.from(table).select("id,edit_token").eq("id", id).single();
      if (!row || row.edit_token !== editToken) return json({ error: "forbidden" }, 403);
      const { error } = await admin.from(table).delete().eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "method not allowed" }, 405);
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
