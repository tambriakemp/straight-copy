// Admin REST endpoint for project tasks (JWT auth).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import {
  serviceClient, listTasks, createTask, updateTask, deleteTask,
  uploadTaskAttachment, listEpics, createEpic, updateEpic, deleteEpic, TASK_STATUSES, TASK_PRIORITIES, ASSIGNEE_KINDS,
} from "../_shared/project-tasks.ts";

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
      const { data: att } = await sb.from("project_task_attachments").select("storage_path").eq("id", parts[1]).maybeSingle();
      if (att) await sb.storage.from("project-task-attachments").remove([att.storage_path]);
      await sb.from("project_task_attachments").delete().eq("id", parts[1]);
      return json({ ok: true });
    }

    // ---- TASKS ----
    if (parts[0] === "tasks" && parts.length === 1 && method === "GET") {
      const pid = url.searchParams.get("project_id");
      if (!pid) return json({ error: "project_id required" }, 400);
      return json(await listTasks(sb, pid));
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
      return json({ statuses: TASK_STATUSES, priorities: TASK_PRIORITIES, assignee_kinds: ASSIGNEE_KINDS });
    }

    return json({ error: "Not found", path, method }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
