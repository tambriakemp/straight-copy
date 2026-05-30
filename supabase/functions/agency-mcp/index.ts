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

// ============================================================
// Knowledge Base (Wiki) tools
// ============================================================
const WIKI_DEPARTMENTS = [
  "CEO","Sales","Hiring","Finance and Data","Masterminds","Client Experience",
  "Podcasting","Website","Content & Repurposing","Opt Ins","Tech",
  "Course Creation","Marketing & Visibility","Other",
] as const;
const WIKI_DOC_TYPES = ["SOP","Vendor Info","Client Resource","Reference","Policy","Other"] as const;
const WIKI_STATUSES = ["Draft","Active","Archived"] as const;
const WIKI_ACCESS = ["Founder Only","All Staff"] as const;

function wikiSlugify(s: string) {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80) || "untitled";
}

async function uniqueWikiSlug(base: string, ignoreId?: string): Promise<string> {
  let slug = base; let i = 2;
  while (true) {
    const q = sb.from("wiki_documents").select("id").eq("slug", slug).limit(1);
    const { data } = await q;
    const taken = (data ?? []).filter((r: any) => r.id !== ignoreId);
    if (taken.length === 0) return slug;
    slug = `${base}-${i++}`;
  }
}

mcp.tool("list_wiki_documents", {
  description: "List knowledge base documents (SOPs, vendor info, references, etc.). Optionally filter by department, doc_type, status, or access_level. Content is omitted from the list — use get_wiki_document for full text.",
  inputSchema: {
    type: "object",
    properties: {
      department: { type: "string", enum: WIKI_DEPARTMENTS as unknown as string[] },
      doc_type: { type: "string", enum: WIKI_DOC_TYPES as unknown as string[] },
      status: { type: "string", enum: WIKI_STATUSES as unknown as string[] },
      access_level: { type: "string", enum: WIKI_ACCESS as unknown as string[] },
      tag: { type: "string", description: "Filter to docs containing this tag." },
      limit: { type: "number", description: "Default 100, max 500." },
    },
  },
  handler: async ({ department, doc_type, status, access_level, tag, limit }: any) => {
    let q = sb.from("wiki_documents")
      .select("id, title, slug, department, doc_type, status, access_level, owner, tags, last_reviewed_at, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(Math.min(limit ?? 100, 500));
    if (department) q = q.eq("department", department);
    if (doc_type) q = q.eq("doc_type", doc_type);
    if (status) q = q.eq("status", status);
    if (access_level) q = q.eq("access_level", access_level);
    if (tag) q = q.contains("tags", [tag]);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return textResult(data);
  },
});

mcp.tool("search_wiki_documents", {
  description: "Full-text search over knowledge base documents (title + content). Returns matching docs with snippets.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string" },
      limit: { type: "number", description: "Default 25, max 100." },
    },
    required: ["query"],
  },
  handler: async ({ query, limit }: { query: string; limit?: number }) => {
    const pat = `%${query.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    const { data, error } = await sb.from("wiki_documents")
      .select("id, title, slug, department, doc_type, status, access_level, tags, updated_at, content")
      .or(`title.ilike.${pat},content.ilike.${pat}`)
      .order("updated_at", { ascending: false })
      .limit(Math.min(limit ?? 25, 100));
    if (error) throw new Error(error.message);
    const out = (data ?? []).map((d: any) => {
      const idx = d.content?.toLowerCase().indexOf(query.toLowerCase()) ?? -1;
      const snippet = idx >= 0
        ? "…" + d.content.slice(Math.max(0, idx - 80), idx + 200) + "…"
        : (d.content ?? "").slice(0, 200);
      const { content: _c, ...rest } = d;
      return { ...rest, snippet };
    });
    return textResult(out);
  },
});

mcp.tool("get_wiki_document", {
  description: "Fetch one knowledge base document with full content. Provide either id or slug.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      slug: { type: "string" },
    },
  },
  handler: async ({ id, slug }: { id?: string; slug?: string }) => {
    if (!id && !slug) throw new Error("Provide id or slug");
    let q = sb.from("wiki_documents").select("*");
    q = id ? q.eq("id", id) : q.eq("slug", slug!);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Document not found");
    return textResult(data);
  },
});

const WIKI_WRITE_PROPS = {
  title: { type: "string" },
  content: { type: "string", description: "Markdown body." },
  department: { type: "string", enum: WIKI_DEPARTMENTS as unknown as string[] },
  doc_type: { type: "string", enum: WIKI_DOC_TYPES as unknown as string[] },
  status: { type: "string", enum: WIKI_STATUSES as unknown as string[] },
  access_level: { type: "string", enum: WIKI_ACCESS as unknown as string[] },
  owner: { type: "string", description: "Free-text owner/team name." },
  tags: { type: "array", items: { type: "string" } },
  slug: { type: "string", description: "Optional. Auto-generated from title if omitted." },
};

mcp.tool("create_wiki_document", {
  description: "Create a new knowledge base document (SOP, vendor info, policy, reference, etc.). Title, content, department, and doc_type are required.",
  inputSchema: {
    type: "object",
    properties: WIKI_WRITE_PROPS,
    required: ["title", "content", "department", "doc_type"],
  },
  handler: async (args: any) => {
    const base = wikiSlugify(args.slug || args.title);
    const slug = await uniqueWikiSlug(base);
    const row = {
      title: args.title,
      slug,
      content: args.content,
      department: args.department,
      doc_type: args.doc_type,
      status: args.status ?? "Draft",
      access_level: args.access_level ?? "All Staff",
      owner: args.owner ?? null,
      tags: args.tags ?? [],
      last_reviewed_at: new Date().toISOString(),
    };
    const { data, error } = await sb.from("wiki_documents").insert(row).select("*").single();
    if (error) throw new Error(error.message);
    await sb.from("wiki_revisions").insert({
      document_id: data.id, title: data.title, content: data.content,
      change_note: "Created via Claude MCP", edited_by_name: "Claude",
    });
    return textResult(data);
  },
});

mcp.tool("update_wiki_document", {
  description: "Update fields on a knowledge base document. Any omitted field is left unchanged. Records a revision when title or content changes.",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "string" },
      change_note: { type: "string", description: "Optional summary of the change for the revision log." },
      ...WIKI_WRITE_PROPS,
    },
    required: ["id"],
  },
  handler: async ({ id, change_note, ...patch }: any) => {
    const { data: existing, error: e1 } = await sb.from("wiki_documents").select("*").eq("id", id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!existing) throw new Error("Document not found");

    const update: Record<string, unknown> = {};
    for (const k of ["title","content","department","doc_type","status","access_level","owner","tags"]) {
      if (patch[k] !== undefined) update[k] = patch[k];
    }
    if (patch.slug !== undefined) {
      update.slug = await uniqueWikiSlug(wikiSlugify(patch.slug), id);
    } else if (patch.title !== undefined && patch.title !== existing.title) {
      // keep existing slug unless caller explicitly changes it
    }
    if (update.content !== undefined || update.title !== undefined) {
      update.last_reviewed_at = new Date().toISOString();
    }

    const { data, error } = await sb.from("wiki_documents").update(update).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);

    if (update.title !== undefined || update.content !== undefined) {
      await sb.from("wiki_revisions").insert({
        document_id: id,
        title: data.title,
        content: data.content,
        change_note: change_note ?? "Updated via Claude MCP",
        edited_by_name: "Claude",
      });
    }
    return textResult(data);
  },
});

mcp.tool("delete_wiki_document", {
  description: "Permanently delete a knowledge base document and its revisions. Use archive (status='Archived') instead when possible.",
  inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  handler: async ({ id }: { id: string }) => {
    const { error } = await sb.from("wiki_documents").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return textResult({ deleted: true, id });
  },
});

mcp.tool("list_wiki_revisions", {
  description: "List revision history for a knowledge base document, newest first.",
  inputSchema: {
    type: "object",
    properties: {
      document_id: { type: "string" },
      limit: { type: "number", description: "Default 25, max 100." },
    },
    required: ["document_id"],
  },
  handler: async ({ document_id, limit }: { document_id: string; limit?: number }) => {
    const { data, error } = await sb.from("wiki_revisions")
      .select("id, title, change_note, edited_by_name, edited_at")
      .eq("document_id", document_id)
      .order("edited_at", { ascending: false })
      .limit(Math.min(limit ?? 25, 100));
    if (error) throw new Error(error.message);
    return textResult(data);
  },
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
