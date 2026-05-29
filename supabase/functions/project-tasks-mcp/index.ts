// MCP server for project tasks. Bearer token auth via api_tokens table.
// Tools: list_projects, list_tasks, get_task, create_task, update_task,
// move_task_status, add_comment_to_task, list_epics, create_epic
import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import {
  serviceClient, listTasks, createTask, updateTask, deleteTask,
  listEpics, createEpic, TASK_STATUSES, TASK_PRIORITIES,
} from "../_shared/project-tasks.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PROJECT_ORIGIN = new URL(SUPABASE_URL).origin;
const OAUTH_BASE = `${PROJECT_ORIGIN}/functions/v1/mcp-oauth`;
const MCP_URL = `${PROJECT_ORIGIN}/functions/v1/project-tasks-mcp`;
const RESOURCE_METADATA_URL = `${MCP_URL}/.well-known/oauth-protected-resource`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Expose-Headers": "mcp-session-id, www-authenticate",
};

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function checkToken(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7).trim();
  const hash = await sha256(token);
  const sb = serviceClient();

  // 1) Static API token
  const { data: apiTok } = await sb.from("api_tokens").select("id, revoked").eq("token_hash", hash).maybeSingle();
  if (apiTok && !apiTok.revoked) {
    sb.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", apiTok.id).then(() => {});
    return true;
  }

  // 2) OAuth access token
  const { data: oauthTok } = await sb.from("mcp_oauth_tokens")
    .select("id, revoked, expires_at").eq("token_hash", hash).maybeSingle();
  if (oauthTok && !oauthTok.revoked && new Date(oauthTok.expires_at).getTime() > Date.now()) {
    sb.from("mcp_oauth_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", oauthTok.id).then(() => {});
    return true;
  }

  return false;
}

const sb = serviceClient();
const mcp = new McpServer({ name: "project-tasks-mcp", version: "1.0.0" });

const textResult = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

mcp.tool({
  name: "list_projects",
  description: "List all active client projects (id, name, type, client business name).",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    const { data, error } = await sb.from("client_projects")
      .select("id, name, type, status, client:clients(id, business_name)")
      .eq("status", "active").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return textResult(data);
  },
});

mcp.tool({
  name: "list_tasks",
  description: "List tasks for a project. Optionally filter by status.",
  inputSchema: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "client_projects.id" },
      status: { type: "string", enum: TASK_STATUSES as unknown as string[] },
    },
    required: ["project_id"],
  },
  handler: async ({ project_id, status }: { project_id: string; status?: string }) => {
    const { tasks, epics } = await listTasks(sb, project_id);
    const filtered = status ? tasks.filter((t: any) => t.status === status) : tasks;
    return textResult({ tasks: filtered, epics });
  },
});

mcp.tool({
  name: "get_task",
  description: "Fetch a single task by id with subtasks and attachments.",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  handler: async ({ id }: { id: string }) => {
    const { data, error } = await sb.from("project_tasks").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Task not found");
    const [subs, atts] = await Promise.all([
      sb.from("project_tasks").select("*").eq("parent_task_id", id).order("order_index"),
      sb.from("project_task_attachments").select("*").eq("task_id", id),
    ]);
    return textResult({ ...data, subtasks: subs.data ?? [], attachments: atts.data ?? [] });
  },
});

mcp.tool({
  name: "create_task",
  description: "Create a task or subtask. For subtask, supply parent_task_id.",
  inputSchema: {
    type: "object",
    properties: {
      client_project_id: { type: "string" },
      parent_task_id: { type: "string" },
      epic_id: { type: "string" },
      name: { type: "string" },
      description: { type: "string" },
      status: { type: "string", enum: TASK_STATUSES as unknown as string[] },
      priority: { type: "string", enum: TASK_PRIORITIES as unknown as string[] },
      assignee_kind: { type: "string", enum: ["unassigned", "admin", "claude"] },
      url: { type: "string" },
      due_date: { type: "string", description: "YYYY-MM-DD" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["client_project_id", "name"],
  },
  handler: async (args: any) => textResult(await createTask(sb, args, null)),
});

mcp.tool({
  name: "update_task",
  description: "Update any task fields.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      epic_id: { type: ["string", "null"] },
      name: { type: "string" },
      description: { type: "string" },
      status: { type: "string", enum: TASK_STATUSES as unknown as string[] },
      priority: { type: "string", enum: TASK_PRIORITIES as unknown as string[] },
      assignee_kind: { type: "string", enum: ["unassigned", "admin", "claude"] },
      url: { type: "string" },
      due_date: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["id"],
  },
  handler: async ({ id, ...rest }: any) => textResult(await updateTask(sb, id, rest)),
});

mcp.tool({
  name: "move_task_status",
  description: "Shortcut to change a task's status.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      status: { type: "string", enum: TASK_STATUSES as unknown as string[] },
    },
    required: ["id", "status"],
  },
  handler: async ({ id, status }: { id: string; status: string }) =>
    textResult(await updateTask(sb, id, { status: status as any })),
});

mcp.tool({
  name: "add_comment_to_task",
  description: "Append a Claude-authored comment to a task's description (timestamped).",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" }, comment: { type: "string" } },
    required: ["id", "comment"],
  },
  handler: async ({ id, comment }: { id: string; comment: string }) => {
    const { data } = await sb.from("project_tasks").select("description").eq("id", id).maybeSingle();
    const prev = (data?.description ?? "").trim();
    const stamp = new Date().toISOString();
    const next = `${prev ? prev + "\n\n" : ""}> **Claude (${stamp}):** ${comment}`;
    return textResult(await updateTask(sb, id, { description: next }));
  },
});

mcp.tool({
  name: "delete_task",
  description: "Delete a task and its subtasks + attachments.",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  handler: async ({ id }: { id: string }) => textResult(await deleteTask(sb, id)),
});

mcp.tool({
  name: "list_epics",
  description: "List epics for a project.",
  inputSchema: { type: "object", properties: { project_id: { type: "string" } }, required: ["project_id"] },
  handler: async ({ project_id }: { project_id: string }) => textResult(await listEpics(sb, project_id)),
});

mcp.tool({
  name: "create_epic",
  description: "Create an epic for a project.",
  inputSchema: {
    type: "object",
    properties: {
      project_id: { type: "string" },
      name: { type: "string" },
      color: { type: "string" },
    },
    required: ["project_id", "name"],
  },
  handler: async ({ project_id, name, color }: any) => textResult(await createEpic(sb, project_id, name, color)),
});

const app = new Hono();
const transport = new StreamableHttpTransport();

app.options("/*", (c) => new Response(null, { headers: corsHeaders }));

app.all("/*", async (c) => {
  const ok = await checkToken(c.req.raw);
  if (!ok) {
    return new Response(JSON.stringify({ error: "Invalid or missing token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const res = await transport.handleRequest(c.req.raw, mcp);
  // Merge CORS headers
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
});

Deno.serve(app.fetch);
