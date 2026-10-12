// Agency MCP server — unified MCP endpoint for projects, tasks, knowledge base,
// clients, and client projects. Bearer token auth via api_tokens or mcp_oauth_tokens.
import { Hono } from "hono";
import { McpServer, StreamableHttpTransport, RpcError, JSON_RPC_ERROR_CODES } from "mcp-lite";
import {
  serviceClient, listTasks, createTask, updateTask, deleteTask,
  uploadTaskAttachment, listEpics, createEpic, TASK_STATUSES, TASK_PRIORITIES,
  TASK_SIZES, TASK_PLATFORMS,
  addAcceptanceCriterion, updateAcceptanceCriterion, deleteAcceptanceCriterion,
} from "../_shared/project-tasks.ts";
import { executeAction, type ActionRow } from "../_shared/agents/actions.ts";
import { executeReadTool } from "../_shared/agents/read-tools.ts";
import { logProposalEvent } from "../_shared/proposal-events.ts";
import {
  editBlockedReason, MCP_PROPOSAL_ACTOR, proposalListItem, type ProposalListRow,
} from "../_shared/agents/proposal-mcp.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PROJECT_ORIGIN = new URL(SUPABASE_URL).origin;
const OAUTH_BASE = `${PROJECT_ORIGIN}/functions/v1/mcp-oauth`;
const MCP_URL = `${PROJECT_ORIGIN}/functions/v1/agency-mcp`;
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
const mcp = new McpServer({ name: "agency-mcp", version: "2.0.0" });

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

/**
 * A bad task field — a made-up epic_id, a size outside S/M/L — reaches the
 * database as a Postgres error (FK/check/type violation) rather than a schema
 * rejection, because create_task/update_task accept free-form values and let
 * the table's own constraints be the validator. mcp-lite turns any thrown
 * non-RpcError into a blanket "Internal error" with the real reason buried in
 * a data field most clients never show, which is what made three separate
 * bad-value mistakes (a stale epic_id, an out-of-range size) look like "the
 * tags/size/epic_id fields are broken" rather than three bad requests.
 * Recognise Postgres codes for exactly this shape of failure and surface the
 * real reason at the top level instead. Anything else is rethrown unchanged —
 * a genuine internal error should still read as one.
 */
function taskWriteError(error: unknown): never {
  const err = error as { code?: string; message?: string; details?: string; hint?: string } | null;
  const code = err?.code;
  // A PostgREST error is a plain object, not an Error — String() on it yields
  // "[object Object]", which is exactly as useless as the -32603 this replaces.
  const message = error instanceof Error
    ? error.message
    : [err?.message, err?.details, err?.hint].filter(Boolean).join(" — ") || JSON.stringify(error);

  if (code === "23503") {
    throw new RpcError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, `Invalid reference: ${message}`);
  }
  if (code === "23514" || code === "22P02") {
    throw new RpcError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, `Invalid value: ${message}`);
  }
  throw error;
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

/**
 * The sweep's entry point.
 *
 * list_tasks requires a project_id, which is why the ready-for-claude routine
 * could only ever process one board. This returns every project that has work
 * waiting AND somewhere to push it, so one routine can walk them all.
 */
mcp.tool("list_queue_projects", {
  description:
    "Projects with ready_for_claude tasks waiting and a repo configured, in board order. " +
    "Only unclaimed tasks assigned to Claude — an unassigned one is left alone until somebody assigns it. " +
    "Each carries everything a coding session needs: repo, branch, deploy target, toolchain, " +
    "build notes, and delivery_mode — 'pr' opens a pull request and stops, 'pr_merge' opens and merges it, " +
    "'push' commits straight to the branch. " +
    "Use this to drive a sweep across every board instead of naming one project.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    const { data: projects, error } = await sb.from("client_projects")
      .select(
        "id, name, type, status, repo_url, repo_branch, deploy_provider, " +
          "deploy_project_id, deploy_project_name, toolchain, delivery_mode, " +
          "build_notes, client:clients(id, business_name)",
      )
      .eq("queue_enabled", true)
      .neq("status", "complete");
    if (error) throw new Error(error.message);

    // Untyped client rows come back as GenericStringError; declare the shape.
    const projectRows = (projects ?? []) as unknown as Array<{ id: string } & Record<string, unknown>>;
    const ids = projectRows.map((p) => p.id);
    if (!ids.length) return textResult({ projects: [] });

    // Unclaimed only: a task another run is holding is not waiting for this one.
    //
    // And assigned to Claude, strictly. This used to accept `unassigned` too,
    // on the reasoning that a task sitting in a column called ready_for_claude
    // must be meant for it. That guess is what put "Press Send to client on the
    // proposal" — assigned to `agency` — in front of a coding run.
    //
    // This has to stay in step with on_task_ready_for_claude, which decides
    // whether to fire a run at all. If the two disagree, a task either wakes a
    // run that cannot see it, or is visible to a run nothing ever wakes.
    const { data: tasks, error: tErr } = await sb.from("project_tasks")
      .select("id, client_project_id, name, created_at, claimed_by, priority, order_index")
      .eq("status", "ready_for_claude")
      .in("client_project_id", ids)
      .is("claimed_by", null)
      .eq("assignee_kind", "claude")
      // Board order, which is how a person reading the column expects it
      // worked — not creation order.
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });
    if (tErr) throw new Error(tErr.message);

    const byProject = new Map<string, Array<Record<string, unknown>>>();
    for (const t of tasks ?? []) {
      const list = byProject.get(t.client_project_id) ?? [];
      list.push({
        id: t.id, name: t.name, created_at: t.created_at,
        priority: t.priority, order_index: t.order_index,
      });
      byProject.set(t.client_project_id, list);
    }

    return textResult({
      projects: projectRows
        .map((p) => ({ ...p, ready_tasks: byProject.get(p.id) ?? [] }))
        .filter((p) => p.ready_tasks.length > 0),
    });
  },
});

/**
 * Take a task, or find out someone else has it.
 *
 * Moving a task to in_progress is not a claim — two runs can both read it as
 * ready and both move it, and the second silently redoes the first's work. This
 * is a conditional update: whoever wins, wins, and the loser is told now rather
 * than at push time.
 */
mcp.tool("claim_task", {
  description:
    "Claim a task before working on it. Returns claimed:true if it is yours, or claimed:false and who holds it. " +
    "ALWAYS claim before starting, and skip anything you did not get. A claim older than 90 minutes is treated " +
    "as abandoned so a dead run cannot block the queue forever.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      worker: { type: "string", description: "Who is claiming — a run id or routine name." },
    },
    required: ["task_id", "worker"],
  },
  handler: async ({ task_id, worker }: { task_id: string; worker: string }) => {
    const { data, error } = await sb.rpc("claim_task", { _task_id: task_id, _worker: worker });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return textResult(row ?? { claimed: false, held_by: null });
  },
});

mcp.tool("release_task", {
  description:
    "Hand a task back when you are done with it or could not finish, so the next sweep can pick it up. " +
    "Call this on the way out of every task you claimed, including ones you moved to blocked.",
  inputSchema: {
    type: "object",
    properties: { task_id: { type: "string" }, worker: { type: "string" } },
    required: ["task_id", "worker"],
  },
  handler: async ({ task_id, worker }: { task_id: string; worker: string }) => {
    const { error } = await sb.rpc("release_task", { _task_id: task_id, _worker: worker });
    if (error) throw new Error(error.message);
    return textResult({ released: true, task_id });
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
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "project_tasks.id" },
      id: { type: "string", description: "Deprecated alias for task_id." },
    },
  },
  handler: async (args: any) => {
    const id = args.task_id ?? args.id;
    if (!id) throw new Error("task_id required");
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
  handler: async (args: any) => {
    try {
      return textResult(await createTask(sb, args, null));
    } catch (error) {
      taskWriteError(error);
    }
  },
});

mcp.tool("update_task", {
  description: "Update any task fields. Pass task_id to identify the task.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "project_tasks.id of the task to update" },
      id: { type: "string", description: "Deprecated alias for task_id." },
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
  },
  handler: async (args: any) => {
    const { task_id, id, ...rest } = args;
    const targetId = task_id ?? id;
    if (!targetId) throw new Error("task_id required");
    try {
      return textResult(await updateTask(sb, targetId, rest));
    } catch (error) {
      taskWriteError(error);
    }
  },
});

mcp.tool("move_task_status", {
  description: "Shortcut to change a task's status.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "project_tasks.id" },
      id: { type: "string", description: "Deprecated alias for task_id." },
      status: { type: "string", enum: TASK_STATUSES as unknown as string[] },
    },
    required: ["status"],
  },
  handler: async (args: any) => {
    const targetId = args.task_id ?? args.id;
    if (!targetId) throw new Error("task_id required");
    return textResult(await updateTask(sb, targetId, { status: args.status as any }));
  },
});

mcp.tool("add_comment_to_task", {
  description: "Append a Claude-authored comment to a task's description (timestamped). Prefer post_task_comment for proper threaded comments.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "project_tasks.id" },
      id: { type: "string", description: "Deprecated alias for task_id." },
      comment: { type: "string" },
    },
    required: ["comment"],
  },
  handler: async (args: any) => {
    const targetId = args.task_id ?? args.id;
    if (!targetId) throw new Error("task_id required");
    const { data } = await sb.from("project_tasks").select("description").eq("id", targetId).maybeSingle();
    const prev = (data?.description ?? "").trim();
    const stamp = new Date().toISOString();
    const next = `${prev ? prev + "\n\n" : ""}> **Claude (${stamp}):** ${args.comment}`;
    return textResult(await updateTask(sb, targetId, { description: next }));
  },
});

mcp.tool("delete_task", {
  description: "Delete a task and its subtasks + attachments.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "project_tasks.id" },
      id: { type: "string", description: "Deprecated alias for task_id." },
    },
  },
  handler: async (args: any) => {
    const targetId = args.task_id ?? args.id;
    if (!targetId) throw new Error("task_id required");
    return textResult(await deleteTask(sb, targetId));
  },
});


mcp.tool("list_my_comments", {
  description: "List task comments addressed to a given @handle (default 'claude-code'). Returns unacknowledged comments by default so Claude Code can iterate through fresh work. Pass include_acknowledged=true to include comments already marked seen, or project_id to scope to one project.",
  inputSchema: {
    type: "object",
    properties: {
      handle: { type: "string", description: "Mention handle without the @, e.g. 'claude-code'. Defaults to 'claude-code'." },
      project_id: { type: "string", description: "Optional client_projects.id to scope results." },
      include_acknowledged: { type: "boolean", description: "Include comments this handle has already acknowledged. Defaults to false." },
      limit: { type: "number", description: "Default 50, max 200." },
    },
  },
  handler: async ({ handle, project_id, include_acknowledged, limit }: {
    handle?: string; project_id?: string; include_acknowledged?: boolean; limit?: number;
  }) => {
    const h = (handle ?? "claude-code").toLowerCase();
    let q = sb.from("project_task_comments")
      .select("id, task_id, author_name, body, mentions, acknowledged_by, created_at, updated_at, task:project_tasks!inner(id, name, status, client_project_id)")
      .contains("mentions", [h])
      .order("created_at", { ascending: false })
      .limit(Math.min(limit ?? 50, 200));
    if (project_id) q = q.eq("task.client_project_id", project_id);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []).filter((r: any) =>
      include_acknowledged ? true : !(r.acknowledged_by ?? []).includes(h),
    );
    return textResult({ handle: h, count: rows.length, comments: rows });
  },
});

mcp.tool("list_task_comments", {
  description: "List every comment on a single task, oldest first.",
  inputSchema: {
    type: "object",
    properties: { task_id: { type: "string" } },
    required: ["task_id"],
  },
  handler: async ({ task_id }: { task_id: string }) => {
    const { data, error } = await sb.from("project_task_comments")
      .select("*").eq("task_id", task_id).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return textResult(data ?? []);
  },
});

mcp.tool("post_task_comment", {
  description: "Post a new comment on a task. Mentions like @team are auto-extracted from body; pass `mentions` to override. `author_name` defaults to 'Claude Code'.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string" },
      body: { type: "string" },
      author_name: { type: "string" },
      mentions: { type: "array", items: { type: "string" } },
    },
    required: ["task_id", "body"],
  },
  handler: async ({ task_id, body, author_name, mentions }: {
    task_id: string; body: string; author_name?: string; mentions?: string[];
  }) => {
    const text = body.trim();
    if (!text) throw new Error("body required");
    const auto = Array.from(new Set(
      (text.match(/@([a-zA-Z0-9_\-]+)/g) ?? []).map((m: string) => m.slice(1).toLowerCase()),
    ));
    const finalMentions = (mentions && mentions.length ? mentions : auto).map((s) => s.toLowerCase());
    const { data, error } = await sb.from("project_task_comments").insert({
      task_id, author_user_id: null, author_name: author_name ?? "Claude Code",
      body: text, mentions: finalMentions,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return textResult(data);
  },
});

mcp.tool("acknowledge_comment", {
  description: "Mark a comment as acknowledged by a handle (default 'claude-code') so it stops appearing in list_my_comments. Idempotent.",
  inputSchema: {
    type: "object",
    properties: {
      comment_id: { type: "string" },
      handle: { type: "string", description: "Defaults to 'claude-code'." },
    },
    required: ["comment_id"],
  },
  handler: async ({ comment_id, handle }: { comment_id: string; handle?: string }) => {
    const h = (handle ?? "claude-code").toLowerCase();
    const { data: cur, error: e1 } = await sb.from("project_task_comments")
      .select("acknowledged_by").eq("id", comment_id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!cur) throw new Error("Comment not found");
    const next = Array.from(new Set([...(cur.acknowledged_by ?? []), h]));
    const { data, error } = await sb.from("project_task_comments")
      .update({ acknowledged_by: next }).eq("id", comment_id).select("*").single();
    if (error) throw new Error(error.message);
    return textResult(data);
  },
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

// ============================================================
// Clients
// ============================================================
const APP_ORIGIN_FOR_LINKS = "https://cre8visions.com";

function buildClientPortalLinks(clientId: string) {
  return {
    portal: `${APP_ORIGIN_FOR_LINKS}/portal/${clientId}`,
    brand_kit_chat: `${APP_ORIGIN_FOR_LINKS}/portal/${clientId}/brand-kit`,
    onboarding: `${APP_ORIGIN_FOR_LINKS}/portal/${clientId}?focus=onboarding`,
  };
}

const CLIENT_TIERS = ["launch","growth","scale","app_development"] as const;
const CLIENT_PIPELINE_STAGES = [
  "intake_submitted","onboarding_in_progress","contract_sent","contract_signed",
  "build_in_progress","delivered","completed","churned",
] as const;

const CLIENT_WRITE_PROPS = {
  business_name: { type: "string" },
  contact_name: { type: "string" },
  contact_email: { type: "string" },
  contact_phone: { type: "string" },
  tier: { type: "string", enum: CLIENT_TIERS as unknown as string[] },
  pipeline_stage: { type: "string" },
  notes: { type: "string" },
  archived: { type: "boolean" },
  build_start_date: { type: ["string","null"], description: "YYYY-MM-DD" },
  delivery_date: { type: ["string","null"], description: "YYYY-MM-DD" },
  delivery_video_url: { type: ["string","null"] },
  build_update_note: { type: ["string","null"] },
  intake_summary: { type: "string" },
  brand_voice_status: { type: "string", enum: ["pending","in_progress","complete","failed"] },
  brand_voice_approved: { type: "boolean" },
  subscription_status: { type: "string" },
  surecart_subscription_id: { type: "string" },
  surecart_customer_id: { type: "string" },
  surecart_order_id: { type: "string" },
};

mcp.tool("list_clients", {
  description: "List clients. Filter by tier, pipeline_stage, or archived state. Excludes large jsonb columns; use get_client for full record.",
  inputSchema: {
    type: "object",
    properties: {
      tier: { type: "string", enum: CLIENT_TIERS as unknown as string[] },
      pipeline_stage: { type: "string" },
      archived: { type: "boolean", description: "Defaults to false." },
      search: { type: "string", description: "Substring match against business_name / contact_name / contact_email." },
      limit: { type: "number", description: "Default 100, max 500." },
    },
  },
  handler: async ({ tier, pipeline_stage, archived, search, limit }: any) => {
    let q = sb.from("clients")
      .select("id, business_name, contact_name, contact_email, contact_phone, tier, pipeline_stage, archived, subscription_status, build_start_date, delivery_date, brand_voice_status, brand_voice_approved, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(Math.min(limit ?? 100, 500));
    q = q.eq("archived", archived ?? false);
    if (tier) q = q.eq("tier", tier);
    if (pipeline_stage) q = q.eq("pipeline_stage", pipeline_stage);
    if (search) {
      const pat = `%${search.replace(/[%_]/g, (m: string) => `\\${m}`)}%`;
      q = q.or(`business_name.ilike.${pat},contact_name.ilike.${pat},contact_email.ilike.${pat}`);
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const enriched = (data ?? []).map((c: any) => ({ ...c, portal_links: buildClientPortalLinks(c.id) }));
    return textResult(enriched);
  },
});

mcp.tool("get_client", {
  description: "Fetch a single client with full record, portal links, projects, and active journey node.",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  handler: async ({ id }: { id: string }) => {
    const { data, error } = await sb.from("clients").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Client not found");
    const [projects, nodes] = await Promise.all([
      sb.from("client_projects").select("id, name, type, status, created_at").eq("client_id", id).order("created_at"),
      sb.from("journey_nodes")
        .select("id, key, label, order_index, status, started_at, completed_at, client_project_id")
        .eq("client_id", id).order("order_index"),
    ]);
    return textResult({
      ...data,
      portal_links: buildClientPortalLinks(id),
      projects: projects.data ?? [],
      journey_nodes: nodes.data ?? [],
    });
  },
});

mcp.tool("create_client", {
  description: "Create a new client. Triggers in the database will auto-create a default project and seed journey nodes based on tier.",
  inputSchema: {
    type: "object",
    properties: {
      ...CLIENT_WRITE_PROPS,
    },
    required: ["business_name","contact_email","tier"],
  },
  handler: async (args: any) => {
    const { data, error } = await sb.from("clients").insert(args).select("*").single();
    if (error) throw new Error(error.message);
    return textResult({ ...data, portal_links: buildClientPortalLinks(data.id) });
  },
});

mcp.tool("update_client", {
  description: "Update any fields on a client. Omitted fields are unchanged.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" }, ...CLIENT_WRITE_PROPS },
    required: ["id"],
  },
  handler: async ({ id, ...patch }: any) => {
    const { data, error } = await sb.from("clients").update(patch).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return textResult({ ...data, portal_links: buildClientPortalLinks(id) });
  },
});

mcp.tool("archive_client", {
  description: "Soft-archive a client (sets archived=true). Use delete_client for permanent removal.",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  handler: async ({ id }: { id: string }) => {
    const { data, error } = await sb.from("clients").update({ archived: true }).eq("id", id).select("id, archived").single();
    if (error) throw new Error(error.message);
    return textResult(data);
  },
});

mcp.tool("delete_client", {
  description: "Permanently delete a client and cascade related records. Prefer archive_client unless you really need a hard delete.",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  handler: async ({ id }: { id: string }) => {
    const { error } = await sb.from("clients").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return textResult({ deleted: true, id });
  },
});

mcp.tool("get_client_portal_links", {
  description: "Return the unique client portal URLs for a client (main portal, brand kit chat, onboarding focus link).",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  handler: async ({ id }: { id: string }) => {
    const { data, error } = await sb.from("clients").select("id, business_name, contact_email").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Client not found");
    return textResult({ ...data, ...buildClientPortalLinks(id) });
  },
});

// ============================================================
// Client Projects (full CRUD; complements list_projects)
// ============================================================
const PROJECT_TYPES = ["automation_build","app_development","web_development","marketing","site_preview","other"] as const;
const PROJECT_STATUSES = ["active","paused","completed","archived"] as const;

mcp.tool("get_client_project", {
  description: "Fetch one client project with its tasks, epics, journey nodes, and links.",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  handler: async ({ id }: { id: string }) => {
    const { data, error } = await sb.from("client_projects")
      .select("*, client:clients(id, business_name, contact_email)")
      .eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Project not found");
    const [{ tasks, epics }, nodes, links] = await Promise.all([
      listTasks(sb, id),
      sb.from("journey_nodes").select("id, key, label, order_index, status, started_at, completed_at").eq("client_project_id", id).order("order_index"),
      sb.from("project_links").select("id, label, url, created_at").eq("client_project_id", id).order("created_at"),
    ]);
    return textResult({
      ...data,
      tasks,
      epics,
      journey_nodes: nodes.data ?? [],
      links: links.data ?? [],
    });
  },
});

mcp.tool("create_client_project", {
  description: "Create a new project for a client.",
  inputSchema: {
    type: "object",
    properties: {
      client_id: { type: "string" },
      name: { type: "string" },
      type: { type: "string", enum: PROJECT_TYPES as unknown as string[] },
      status: { type: "string", enum: PROJECT_STATUSES as unknown as string[] },
      notes: { type: "string" },
    },
    required: ["client_id","name","type"],
  },
  handler: async (args: any) => {
    const { data, error } = await sb.from("client_projects").insert({
      client_id: args.client_id,
      name: args.name,
      type: args.type,
      status: args.status ?? "active",
      notes: args.notes ?? null,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return textResult(data);
  },
});

mcp.tool("update_client_project", {
  description: "Update fields on a client project (name, type, status, notes).",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      type: { type: "string", enum: PROJECT_TYPES as unknown as string[] },
      status: { type: "string", enum: PROJECT_STATUSES as unknown as string[] },
      notes: { type: "string" },
    },
    required: ["id"],
  },
  handler: async ({ id, ...patch }: any) => {
    const { data, error } = await sb.from("client_projects").update(patch).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return textResult(data);
  },
});

mcp.tool("delete_client_project", {
  description: "Permanently delete a client project (cascades tasks, epics, journey nodes).",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  handler: async ({ id }: { id: string }) => {
    const { error } = await sb.from("client_projects").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return textResult({ deleted: true, id });
  },
});

mcp.tool("list_project_links", {
  description: "List shared links attached to a project (Figma, docs, etc.).",
  inputSchema: { type: "object", properties: { client_project_id: { type: "string" } }, required: ["client_project_id"] },
  handler: async ({ client_project_id }: { client_project_id: string }) => {
    const { data, error } = await sb.from("project_links")
      .select("*").eq("client_project_id", client_project_id).order("created_at");
    if (error) throw new Error(error.message);
    return textResult(data);
  },
});

mcp.tool("add_project_link", {
  description: "Attach a labeled URL to a project.",
  inputSchema: {
    type: "object",
    properties: {
      client_project_id: { type: "string" },
      label: { type: "string" },
      url: { type: "string" },
    },
    required: ["client_project_id","label","url"],
  },
  handler: async (args: any) => {
    const { data, error } = await sb.from("project_links").insert(args).select("*").single();
    if (error) throw new Error(error.message);
    return textResult(data);
  },
});

mcp.tool("delete_project_link", {
  description: "Remove a project link.",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  handler: async ({ id }: { id: string }) => {
    const { error } = await sb.from("project_links").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return textResult({ deleted: true, id });
  },
});

// ============================================================
// Proposals — DRAFT ONLY.
//
// These reuse the same executors the in-app agent runs (actions.ts and
// read-tools.ts), so a proposal written over MCP is indistinguishable from one
// written in a chat: same content shape, same version snapshots, same events.
// What is deliberately NOT here: sending, follow-ups, decline, void, sign,
// delete, or any status change. A draft becomes visible to the client only
// when Bree presses "Send to client" in the portal.
// ============================================================

/**
 * Run one shared proposal action as the MCP.
 *
 * The synthetic ActionRow exists because executeAction is shaped around the
 * agent_actions ledger. No ledger row is written here — the audit trail for a
 * proposal is proposal_events and client_proposal_versions, which these
 * executors write themselves. `agent_id` is null because the MCP has no
 * agents row: created_by_agent/changed_by_agent are nullable FKs, and the
 * writer's identity travels as proposal_events.actor instead.
 */
async function runProposalAction(
  kind: string,
  title: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const action: ActionRow = {
    id: crypto.randomUUID(),
    run_id: "",
    agent_id: null as unknown as string,
    kind,
    outward: false,
    title,
    description: null,
    payload,
  };
  const outcome = await executeAction(sb, action, MCP_PROPOSAL_ACTOR);
  if (!outcome.ok) {
    throw new RpcError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, outcome.error ?? "Action failed");
  }
  return outcome.result ?? {};
}

/**
 * The MCP's own gate, stricter than the executor's: the shared code refuses
 * only `signed`, so the in-app chat can amend a sent proposal. Over MCP,
 * anything past draft is refused — see editBlockedReason.
 */
async function requireDraftProposal(proposalId: string): Promise<{ id: string; client_id: string }> {
  const { data, error } = await sb.from("client_proposals")
    .select("id, status, client_id").eq("id", proposalId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new RpcError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, "Proposal not found");
  const blocked = editBlockedReason(data.status);
  if (blocked) throw new RpcError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, blocked);
  return { id: data.id, client_id: data.client_id };
}

/** Read tools share the same budget-aware executor the in-app loop uses. */
async function runProposalRead(name: string, input: Record<string, unknown>) {
  const outcome = await executeReadTool({ sb: sb as never, spent: { bytes: 0 } }, name, input);
  if (!outcome.ok) throw new RpcError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, outcome.content);
  // outcome.content is already compact JSON, so it goes out as-is rather than
  // being parsed and re-stringified.
  return { content: [{ type: "text" as const, text: outcome.content }] };
}

mcp.tool("create_proposal_draft", {
  description:
    "Create an empty proposal DRAFT on a client project and get its proposal_id back. " +
    "Drafts are invisible to the client until Bree presses 'Send to client' in the portal — " +
    "this MCP cannot send, sign, void, or delete a proposal, and never changes its status. " +
    "Call read_example_proposal before writing, then fill the document with write_proposal_section, " +
    "one section per call in reading order.",
  inputSchema: {
    type: "object",
    properties: {
      client_id: { type: "string", description: "clients.id" },
      client_project_id: { type: "string", description: "client_projects.id the proposal hangs off." },
      title: { type: "string" },
      kind: { type: "string", description: "Free text — 'marketing retainer', 'app build'." },
      description: { type: "string", description: "One line on what this proposal covers." },
      cover: {
        type: "object",
        description: "Cover page fields. Retainer covers carry price_line; builds do not.",
        properties: {
          client_name: { type: "string" },
          project_name: { type: "string" },
          tagline: { type: "string" },
          prepared_for: { type: "string" },
          prepared_by: { type: "string" },
          date: { type: "string" },
          price_line: { type: "string" },
        },
      },
    },
    required: ["client_id", "client_project_id", "title"],
  },
  handler: async (args: {
    client_id: string; client_project_id: string; title: string;
    kind?: string; description?: string; cover?: Record<string, string>;
  }) => {
    const { title, description, ...payload } = args;
    const action: ActionRow = {
      id: crypto.randomUUID(),
      run_id: "",
      agent_id: null as unknown as string,
      kind: "create_proposal_draft",
      outward: false,
      title,
      description: description ?? null,
      payload: { ...payload, title },
    };
    const outcome = await executeAction(sb, action, MCP_PROPOSAL_ACTOR);
    if (!outcome.ok) {
      throw new RpcError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, outcome.error ?? "Action failed");
    }
    return textResult(outcome.result ?? {});
  },
});

mcp.tool("write_proposal_section", {
  description:
    "Write or rewrite ONE section of a draft proposal. A heading that already exists is replaced " +
    "in place; a new heading is appended. Open the body with a one-line bold thesis, no numbers in " +
    "headings. Always read_proposal the section before rewriting it. Each write snapshots a version, " +
    "so restore_proposal_version can undo it. Refused for anything past draft.",
  inputSchema: {
    type: "object",
    properties: {
      proposal_id: { type: "string" },
      heading: { type: "string", description: "Section heading, no number — 'Investment & Pass-Throughs'." },
      summary: { type: "string", description: "One line for the contents page." },
      body: { type: "string", description: "Markdown: paragraphs, **bold**, '## ' subheads, - lists, > blockquotes." },
      replace: { type: "string", description: "Heading of the section to overwrite, when renaming it in place." },
    },
    required: ["proposal_id", "heading", "body"],
  },
  handler: async (args: {
    proposal_id: string; heading: string; body: string; summary?: string; replace?: string;
  }) => {
    const { client_id } = await requireDraftProposal(args.proposal_id);
    const result = await runProposalAction("write_proposal_section", `Write ${args.heading}`, args);
    // The shared executor snapshots the version but only logs events on
    // create, because in-app the run itself is the audit trail. Over MCP there
    // is no run, so the write lands on the timeline here — same actor field,
    // same table, never blocking the write it describes.
    await logProposalEvent(sb, {
      proposal_id: args.proposal_id,
      client_id,
      event_type: "updated",
      actor: MCP_PROPOSAL_ACTOR,
      detail: { heading: result.heading, action: result.action },
    });
    return textResult(result);
  },
});

mcp.tool("read_proposal", {
  description:
    "Read a proposal you are writing. Without `heading` you get the section list — headings and " +
    "lengths only, cheap. With `heading` you get that ONE section in full. Read a section before " +
    "rewriting it; never pull the whole document back when you need one part.",
  inputSchema: {
    type: "object",
    properties: {
      proposal_id: { type: "string" },
      heading: { type: "string", description: "Exact or partial section heading. Omit for the section list." },
    },
    required: ["proposal_id"],
  },
  handler: (args: { proposal_id: string; heading?: string }) =>
    runProposalRead("read_proposal", args),
});

mcp.tool("read_example_proposal", {
  description:
    "Read a real proposal Cre8 Visions has sent. Do this BEFORE writing one — these documents are " +
    "the authority on how proposals read. Call with no argument for the list; pass a kind " +
    "('marketing retainer', 'app build') or a key to read one in full. Match the register and " +
    "specificity; never copy the content.",
  inputSchema: {
    type: "object",
    properties: {
      which: { type: "string", description: "A kind or key from the list. Omit to see what is available." },
    },
  },
  handler: (args: { which?: string } | undefined) =>
    runProposalRead("read_example_proposal", args ?? {}),
});

mcp.tool("restore_proposal_version", {
  description:
    "Roll a draft proposal back to an earlier version. Without `version` it steps back one, which is " +
    "what 'put it back' almost always means. History is append-only — restoring copies the old " +
    "snapshot forward as a new version, so a restore can itself be undone. Refused past draft.",
  inputSchema: {
    type: "object",
    properties: {
      proposal_id: { type: "string" },
      version: { type: "number", description: "client_proposal_versions.version to restore. Omit to undo the last write." },
    },
    required: ["proposal_id"],
  },
  handler: async (args: { proposal_id: string; version?: number }) => {
    const { client_id } = await requireDraftProposal(args.proposal_id);
    const result = await runProposalAction("restore_proposal_version", "Restore proposal version", args);
    await logProposalEvent(sb, {
      proposal_id: args.proposal_id,
      client_id,
      event_type: "updated",
      actor: MCP_PROPOSAL_ACTOR,
      detail: { restored_from: result.restored_from, now_version: result.now_version },
    });
    return textResult(result);
  },
});

mcp.tool("list_proposals", {
  description:
    "List proposals for a client or a project: id, title, status, sections written, version, sent_at. " +
    "Content is omitted — use read_proposal to page through a document.",
  inputSchema: {
    type: "object",
    properties: {
      client_id: { type: "string", description: "clients.id" },
      client_project_id: { type: "string", description: "client_projects.id" },
      status: { type: "string", enum: ["draft", "sent", "signed", "declined", "voided"] },
    },
  },
  handler: async ({ client_id, client_project_id, status }: {
    client_id?: string; client_project_id?: string; status?: string;
  }) => {
    if (!client_id && !client_project_id) {
      throw new RpcError(JSON_RPC_ERROR_CODES.INVALID_PARAMS, "Provide client_id or client_project_id");
    }
    let q = sb.from("client_proposals")
      .select("id, title, status, content, content_version, sent_at, client_id, client_project_id, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (client_id) q = q.eq("client_id", client_id);
    if (client_project_id) q = q.eq("client_project_id", client_project_id);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return textResult((data ?? []).map((row) => proposalListItem(row as unknown as ProposalListRow)));
  },
});


const app = new Hono().basePath("/agency-mcp");
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
