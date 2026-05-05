// Admin-only management endpoints for preview projects + comments.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, PATCH, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  if (!userRes.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: userRes.user.id });
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";

    if (req.method === "GET" && action === "list") {
      const { data } = await admin
        .from("preview_projects")
        .select("*")
        .order("created_at", { ascending: false });
      return json({ projects: data ?? [] });
    }

    if (req.method === "GET" && action === "get") {
      const id = url.searchParams.get("id")!;
      const { data: project } = await admin.from("preview_projects").select("*").eq("id", id).single();
      const { data: files } = await admin.from("preview_files").select("*").eq("project_id", id).order("path");
      const { data: comments } = await admin
        .from("preview_comments")
        .select("*")
        .eq("project_id", id)
        .order("pin_number", { ascending: true });
      const ids = (comments ?? []).map((c) => c.id);
      let replies: any[] = [];
      if (ids.length) {
        const { data } = await admin
          .from("preview_comment_replies")
          .select("*")
          .in("comment_id", ids)
          .order("created_at", { ascending: true });
        replies = data ?? [];
      }
      return json({ project, files: files ?? [], comments: comments ?? [], replies });
    }

    if (req.method === "POST" && action === "create") {
      const { name, client_label } = await req.json();
      if (!name) return json({ error: "name required" }, 400);
      const slug = genSlug();
      const id = crypto.randomUUID();
      const { data, error } = await admin
        .from("preview_projects")
        .insert({
          id,
          name,
          client_label: client_label || null,
          slug,
          storage_prefix: `previews/${id}/`,
        })
        .select("*")
        .single();
      if (error) throw error;
      return json({ project: data });
    }

    if (req.method === "PATCH" && action === "update") {
      const { id, ...patch } = await req.json();
      const allowed: any = {};
      for (const k of ["name", "client_label", "feedback_enabled", "archived", "entry_path"]) {
        if (k in patch) allowed[k] = patch[k];
      }
      const { data, error } = await admin
        .from("preview_projects")
        .update(allowed)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return json({ project: data });
    }

    if (req.method === "POST" && action === "reply") {
      const { comment_id, body, author_name } = await req.json();
      if (!comment_id || !body) return json({ error: "missing fields" }, 400);
      const { data, error } = await admin
        .from("preview_comment_replies")
        .insert({ comment_id, body, author_name: author_name || "Admin", is_admin: true })
        .select("*")
        .single();
      if (error) throw error;
      return json({ reply: data });
    }

    if (req.method === "PATCH" && action === "comment") {
      const { id, status } = await req.json();
      const { data, error } = await admin
        .from("preview_comments")
        .update({ status })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return json({ comment: data });
    }

    if (req.method === "DELETE" && action === "comment") {
      const { id } = await req.json();
      const { error } = await admin.from("preview_comments").delete().eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (req.method === "DELETE" && action === "project") {
      const { id } = await req.json();
      const { data: proj } = await admin
        .from("preview_projects")
        .select("storage_prefix")
        .eq("id", id)
        .single();
      const { data: files } = await admin.from("preview_files").select("path").eq("project_id", id);
      if (proj && files?.length) {
        await admin.storage
          .from("preview-sites")
          .remove(files.map((f) => `${proj.storage_prefix}${f.path}`));
      }
      const { error } = await admin.from("preview_projects").delete().eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e: any) {
    console.error(e);
    return json({ error: e?.message || String(e) }, 500);
  }
});

function genSlug(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
