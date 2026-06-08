// Admin REST endpoint for project tasks (JWT auth).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import {
  serviceClient, listTasks, createTask, updateTask, deleteTask,
  uploadTaskAttachment, listEpics, createEpic, updateEpic, deleteEpic,
  TASK_STATUSES, TASK_PRIORITIES, ASSIGNEE_KINDS, TASK_SIZES, TASK_PLATFORMS,
} from "../_shared/project-tasks.ts";
import { seedWebDevTasks } from "../_shared/web-dev-tasks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = auth.slice(7);
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return json({ error: "Unauthorized" }, 401);
  const userId = data.user.id;
  const sb = serviceClient();
  const { data: admin } = await sb.from("admin_users").select("id").eq("user_id", userId).maybeSingle();
  if (!admin) return json({ error: "Forbidden" }, 403);
  return { userId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await requireAdmin(req);
  if (guard instanceof Response) return guard;

  const sb = serviceClient();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/project-tasks\/?/, "/").replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  const method = req.method;

  try {
    // ---- EPICS ----
    // GET /epics?project_id=
    if (parts[0] === "epics" && method === "GET") {
      const pid = url.searchParams.get("project_id");
      if (!pid) return json({ error: "project_id required" }, 400);
      return json({ epics: await listEpics(sb, pid) });
    }
    if (parts[0] === "epics" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (!body.client_project_id || !body.name) return json({ error: "client_project_id & name required" }, 400);
      return json({ epic: await createEpic(sb, body.client_project_id, body.name, body.color) });
    }
    if (parts[0] === "epics" && parts[1] && method === "PATCH") {
      const body = await req.json().catch(() => ({}));
      return json({ epic: await updateEpic(sb, parts[1], body) });
    }
    if (parts[0] === "epics" && parts[1] && method === "DELETE") {
      return json(await deleteEpic(sb, parts[1]));
    }

    // ---- ATTACHMENTS ----
    // POST /tasks/:id/attachments  (multipart form-data: file)
    if (parts[0] === "tasks" && parts[1] && parts[2] === "attachments" && method === "POST") {
      const taskId = parts[1];
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file) return json({ error: "file required" }, 400);
      const buf = new Uint8Array(await file.arrayBuffer());
      return json({ attachment: await uploadTaskAttachment(sb, taskId, buf, file.name, file.type || null, guard.userId) });
    }
    if (parts[0] === "attachments" && parts[1] && method === "DELETE") {
      const { data: att } = await sb.from("project_task_attachments").select("storage_path, bucket").eq("id", parts[1]).maybeSingle();
      if (att) await sb.storage.from((att as any).bucket || "project-task-attachments").remove([att.storage_path]);
      await sb.from("project_task_attachments").delete().eq("id", parts[1]);
      return json({ ok: true });
    }

    // ---- COMMENTS ----
    // GET /tasks/:id/comments
    if (parts[0] === "tasks" && parts[1] && parts[2] === "comments" && method === "GET") {
      const { data, error } = await sb
        .from("project_task_comments")
        .select("*")
        .eq("task_id", parts[1])
        .order("created_at", { ascending: true });
      if (error) return json({ error: error.message }, 500);
      return json({ comments: data ?? [] });
    }
    // POST /tasks/:id/comments  { body, author_name?, mentions? }
    if (parts[0] === "tasks" && parts[1] && parts[2] === "comments" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const text = typeof body?.body === "string" ? body.body.trim() : "";
      if (!text) return json({ error: "body required" }, 400);
      const auto = Array.from(new Set(
        (text.match(/@([a-zA-Z0-9_\-]+)/g) ?? []).map((m: string) => m.slice(1).toLowerCase()),
      ));
      const mentions: string[] = Array.isArray(body?.mentions) && body.mentions.length
        ? body.mentions.map((s: string) => String(s).toLowerCase())
        : auto;
      let authorName = typeof body?.author_name === "string" && body.author_name.trim()
        ? body.author_name.trim()
        : "";
      if (!authorName) {
        const { data: u } = await sb.auth.admin.getUserById(guard.userId);
        authorName = (u?.user?.email ?? "Admin").split("@")[0];
      }
      const { data, error } = await sb
        .from("project_task_comments")
        .insert({
          task_id: parts[1],
          author_user_id: guard.userId,
          author_name: authorName,
          body: text,
          mentions,
        })
        .select("*")
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ comment: data });
    }
    // PATCH /comments/:id
    if (parts[0] === "comments" && parts[1] && method === "PATCH") {
      const body = await req.json().catch(() => ({}));
      const patch: Record<string, unknown> = {};
      if (typeof body?.body === "string") {
        patch.body = body.body;
        const auto = Array.from(new Set(
          (body.body.match(/@([a-zA-Z0-9_\-]+)/g) ?? []).map((m: string) => m.slice(1).toLowerCase()),
        ));
        patch.mentions = Array.isArray(body?.mentions) ? body.mentions : auto;
      } else if (Array.isArray(body?.mentions)) {
        patch.mentions = body.mentions;
      }
      const { data, error } = await sb
        .from("project_task_comments")
        .update(patch)
        .eq("id", parts[1])
        .select("*")
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ comment: data });
    }
    // DELETE /comments/:id
    if (parts[0] === "comments" && parts[1] && method === "DELETE") {
      const { error } = await sb.from("project_task_comments").delete().eq("id", parts[1]);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }



    // ---- SEED Web Dev ----
    if (parts[0] === "seed-web-dev" && method === "POST") {
      const body = await req.json().catch(() => ({}));
      const projectId = body.project_id;
      if (!projectId) return json({ error: "project_id required" }, 400);
      const { data: proj } = await sb.from("client_projects").select("type").eq("id", projectId).maybeSingle();
      if (!proj) return json({ error: "Project not found" }, 404);
      if (proj.type !== "web_development") return json({ error: "Project is not web_development" }, 400);
      const result = await seedWebDevTasks(sb, projectId);
      return json(result);
    }

    // ---- TASKS ----
    if (parts[0] === "tasks" && parts.length === 1 && method === "GET") {
      const pid = url.searchParams.get("project_id");
      const all = url.searchParams.get("all");
      if (!pid && !all) return json({ error: "project_id required" }, 400);
      return json(await listTasks(sb, all ? null : pid!));
    }
    if (parts[0] === "tasks" && parts.length === 1 && method === "POST") {
      const body = await req.json().catch(() => ({}));
      return json({ task: await createTask(sb, body, guard.userId) });
    }
    if (parts[0] === "tasks" && parts[1] && method === "PATCH") {
      const body = await req.json().catch(() => ({}));
      return json({ task: await updateTask(sb, parts[1], body) });
    }
    if (parts[0] === "tasks" && parts[1] && method === "DELETE") {
      return json(await deleteTask(sb, parts[1]));
    }

    if (parts[0] === "meta" && method === "GET") {
      return json({ statuses: TASK_STATUSES, priorities: TASK_PRIORITIES, assignee_kinds: ASSIGNEE_KINDS, sizes: TASK_SIZES, platforms: TASK_PLATFORMS });
    }

    return json({ error: "Not found", path, method }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
