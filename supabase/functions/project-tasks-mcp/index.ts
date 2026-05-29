// MCP server for project tasks. Bearer token auth via api_tokens table.
// Tools: list_projects, list_tasks, get_task, create_task, update_task,
// move_task_status, add_comment_to_task, list_epics, create_epic
import { Hono } from "hono";
import { McpServer, StreamableHttpTransport } from "mcp-lite";
import {
  serviceClient, listTasks, createTask, updateTask, deleteTask,
  uploadTaskAttachment, listEpics, createEpic, TASK_STATUSES, TASK_PRIORITIES,
  TASK_SIZES, TASK_PLATFORMS,
  addAcceptanceCriterion, updateAcceptanceCriterion, deleteAcceptanceCriterion,
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

function base64ToBytes(value: string) {
  const clean = value.includes(",") ? value.split(",").pop()! : value;
  const binary = atob(clean.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

mcp.tool("list_projects", {
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

mcp.tool("list_tasks", {
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

mcp.tool("get_task", {
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

const EXTRA_FIELD_PROPS = {
  acceptance_criteria: {
    type: "array",
    description: "Definition-of-done checklist. Each item: { id?, text, done }. Replaces the whole list — use the dedicated add/update/delete criterion tools for surgical edits.",
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        text: { type: "string" },
        done: { type: "boolean" },
      },
      required: ["text"],
    },
  },
  design_url: { type: "string", description: "Link to Figma, comps, or brand kit for design-dependent work." },
  blocked_by: {
    type: "array",
    items: { type: "string" },
    description: "Array of project_tasks.id values that must complete first.",
  },
  manual_prereqs: { type: "string", description: "Human-only prerequisites that block automated work." },
  size: { type: "string", enum: TASK_SIZES as unknown as string[], description: "Effort tee-shirt size." },
  platform: { type: "string", enum: TASK_PLATFORMS as unknown as string[], description: "Target platform." },
};

mcp.tool("create_task", {
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
      ...EXTRA_FIELD_PROPS,
    },
    required: ["client_project_id", "name"],
  },
  handler: async (args: any) => textResult(await createTask(sb, args, null)),
});

mcp.tool("update_task", {
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
      ...EXTRA_FIELD_PROPS,
    },
    required: ["id"],
  },
  handler: async ({ id, ...rest }: any) => textResult(await updateTask(sb, id, rest)),
});

mcp.tool("move_task_status", {
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

mcp.tool("add_comment_to_task", {
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

mcp.tool("delete_task", {
  description: "Delete a task and its subtasks + attachments.",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  handler: async ({ id }: { id: string }) => textResult(await deleteTask(sb, id)),
});

mcp.tool("attach_file_to_task", {
  description: "Attach an image, PDF, document, or other file to an existing task. Provide file_base64 as raw base64 or a data URL.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "project_tasks.id" },
      file_name: { type: "string", description: "Original file name, including extension" },
      file_base64: { type: "string", description: "File content encoded as base64, or a data URL" },
      mime_type: { type: "string", description: "Optional MIME type, for example image/png or application/pdf" },
    },
    required: ["task_id", "file_name", "file_base64"],
  },
  handler: async ({ task_id, file_name, file_base64, mime_type }: {
    task_id: string; file_name: string; file_base64: string; mime_type?: string;
  }) => {
    const bytes = base64ToBytes(file_base64);
    if (bytes.byteLength > 15 * 1024 * 1024) throw new Error("Attachment must be 15MB or smaller");
    return textResult(await uploadTaskAttachment(sb, task_id, bytes, file_name, mime_type ?? null, null));
  },
});

mcp.tool("add_acceptance_criterion", {
  description: "Append a single acceptance-criteria checklist item to a task.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      text: { type: "string" },
      done: { type: "boolean", description: "Defaults to false." },
    },
    required: ["task_id", "text"],
  },
  handler: async ({ task_id, text, done }: { task_id: string; text: string; done?: boolean }) =>
    textResult(await addAcceptanceCriterion(sb, task_id, text, done ?? false)),
});

mcp.tool("update_acceptance_criterion", {
  description: "Edit text and/or done state of one acceptance-criteria item.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      criterion_id: { type: "string" },
      text: { type: "string" },
      done: { type: "boolean" },
    },
    required: ["task_id", "criterion_id"],
  },
  handler: async ({ task_id, criterion_id, text, done }: {
    task_id: string; criterion_id: string; text?: string; done?: boolean;
  }) => textResult(await updateAcceptanceCriterion(sb, task_id, criterion_id, { text, done })),
});

mcp.tool("delete_acceptance_criterion", {
  description: "Remove one acceptance-criteria item from a task.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      criterion_id: { type: "string" },
    },
    required: ["task_id", "criterion_id"],
  },
  handler: async ({ task_id, criterion_id }: { task_id: string; criterion_id: string }) =>
    textResult(await deleteAcceptanceCriterion(sb, task_id, criterion_id)),
});

mcp.tool("list_epics", {
  description: "List epics for a project.",
  inputSchema: { type: "object", properties: { project_id: { type: "string" } }, required: ["project_id"] },
  handler: async ({ project_id }: { project_id: string }) => textResult(await listEpics(sb, project_id)),
});

mcp.tool("create_epic", {
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

const app = new Hono().basePath("/project-tasks-mcp");
const transport = new StreamableHttpTransport();
const mcpHandler = transport.bind(mcp);

app.options("/*", (c) => new Response(null, { headers: corsHeaders }));

// OAuth discovery — Claude.ai probes these on the resource URL to start the auth flow.
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

app.get("/.well-known/oauth-protected-resource", () =>
  new Response(JSON.stringify({
    resource: MCP_URL,
    authorization_servers: [OAUTH_BASE],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  }), { headers: jsonHeaders }),
);

// Some clients look for the auth-server metadata on the resource URL too.
app.get("/.well-known/oauth-authorization-server", () =>
  new Response(JSON.stringify({
    issuer: OAUTH_BASE,
    authorization_endpoint: `${OAUTH_BASE}/authorize`,
    token_endpoint: `${OAUTH_BASE}/token`,
    registration_endpoint: `${OAUTH_BASE}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  }), { headers: jsonHeaders }),
);

app.all("/*", async (c) => {
  const ok = await checkToken(c.req.raw);
  if (!ok) {
    return new Response(JSON.stringify({ error: "invalid_token" }), {
      status: 401,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer realm="mcp", resource_metadata="${RESOURCE_METADATA_URL}"`,
      },
    });
  }
  const res = await mcpHandler(c.req.raw);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
});

Deno.serve(app.fetch);
