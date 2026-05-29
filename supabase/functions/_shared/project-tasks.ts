// Shared helpers for project tasks (REST + MCP).
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

export const TASK_STATUSES = [
  "backlog", "ready_for_claude", "in_progress", "needs_review", "blocked", "complete",
] as const;
export type TaskStatus = typeof TASK_STATUSES[number];
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = typeof TASK_PRIORITIES[number];
export const ASSIGNEE_KINDS = ["unassigned", "admin", "claude"] as const;
export type AssigneeKind = typeof ASSIGNEE_KINDS[number];

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export const TASK_SIZES = ["S", "M", "L"] as const;
export type TaskSize = typeof TASK_SIZES[number];
export const TASK_PLATFORMS = ["web", "native", "backend", "all"] as const;
export type TaskPlatform = typeof TASK_PLATFORMS[number];

export const TASK_FIELDS =
  "id, client_project_id, parent_task_id, epic_id, name, description, status, priority, " +
  "assignee_kind, assignee_admin_id, url, due_date, tags, order_index, created_by, completed_at, created_at, updated_at, " +
  "acceptance_criteria, design_url, blocked_by, manual_prereqs, size, platform";

export interface TaskInput {
  client_project_id?: string;
  parent_task_id?: string | null;
  epic_id?: string | null;
  name?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee_kind?: AssigneeKind;
  assignee_admin_id?: string | null;
  url?: string | null;
  due_date?: string | null;
  tags?: string[];
  order_index?: number;
  acceptance_criteria?: string | null;
  design_url?: string | null;
  blocked_by?: string[];
  manual_prereqs?: string | null;
  size?: TaskSize | null;
  platform?: TaskPlatform | null;
}

export async function listTasks(
  sb: SupabaseClient,
  projectId: string,
) {
  const [tasksRes, epicsRes, attachRes] = await Promise.all([
    sb.from("project_tasks").select(TASK_FIELDS)
      .eq("client_project_id", projectId)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true }),
    sb.from("project_task_epics").select("*")
      .eq("client_project_id", projectId)
      .order("order_index"),
    sb.from("project_task_attachments").select("*"),
  ]);
  if (tasksRes.error) throw tasksRes.error;
  if (epicsRes.error) throw epicsRes.error;
  if (attachRes.error) throw attachRes.error;

  const taskIds = new Set((tasksRes.data ?? []).map((t: any) => t.id));
  const attachByTask = new Map<string, any[]>();
  for (const a of attachRes.data ?? []) {
    if (!taskIds.has(a.task_id)) continue;
    const arr = attachByTask.get(a.task_id) ?? [];
    arr.push(a);
    attachByTask.set(a.task_id, arr);
  }

  // Sign attachment URLs (1h)
  const allAttachments = (attachRes.data ?? []).filter((a: any) => taskIds.has(a.task_id));
  if (allAttachments.length) {
    const signed = await sb.storage
      .from("project-task-attachments")
      .createSignedUrls(allAttachments.map((a: any) => a.storage_path), 3600);
    if (!signed.error) {
      signed.data?.forEach((s, i) => {
        (allAttachments[i] as any).signed_url = s.signedUrl;
      });
    }
  }

  const tasks = (tasksRes.data ?? []).map((t: any) => ({
    ...t,
    attachments: attachByTask.get(t.id) ?? [],
  }));

  return { tasks, epics: epicsRes.data ?? [] };
}

export async function createTask(sb: SupabaseClient, input: TaskInput, createdBy: string | null) {
  if (!input.client_project_id || !input.name) {
    throw new Error("client_project_id and name are required");
  }
  // Default order_index = max + 1 within (project, status)
  const status = input.status ?? "backlog";
  const { data: maxRow } = await sb.from("project_tasks")
    .select("order_index")
    .eq("client_project_id", input.client_project_id)
    .eq("status", status)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.order_index ?? 0) + 1;

  const { data, error } = await sb.from("project_tasks").insert({
    client_project_id: input.client_project_id,
    parent_task_id: input.parent_task_id ?? null,
    epic_id: input.epic_id ?? null,
    name: input.name,
    description: input.description ?? null,
    status,
    priority: input.priority ?? "normal",
    assignee_kind: input.assignee_kind ?? "unassigned",
    assignee_admin_id: input.assignee_admin_id ?? null,
    url: input.url ?? null,
    due_date: input.due_date ?? null,
    tags: input.tags ?? [],
    order_index: input.order_index ?? nextOrder,
    created_by: createdBy,
    acceptance_criteria: input.acceptance_criteria ?? null,
    design_url: input.design_url ?? null,
    blocked_by: input.blocked_by ?? [],
    manual_prereqs: input.manual_prereqs ?? null,
    size: input.size ?? null,
    platform: input.platform ?? null,
  }).select(TASK_FIELDS).single();
  if (error) throw error;
  return data;
}

export async function updateTask(sb: SupabaseClient, id: string, input: TaskInput) {
  const patch: Record<string, unknown> = {};
  for (const k of [
    "parent_task_id", "epic_id", "name", "description", "status", "priority",
    "assignee_kind", "assignee_admin_id", "url", "due_date", "tags", "order_index",
    "acceptance_criteria", "design_url", "blocked_by", "manual_prereqs", "size", "platform",
  ] as const) {
    if (k in input) patch[k] = (input as any)[k];
  }
  const { data, error } = await sb.from("project_tasks")
    .update(patch).eq("id", id).select(TASK_FIELDS).single();
  if (error) throw error;
  return data;
}

export async function deleteTask(sb: SupabaseClient, id: string) {
  // Storage cleanup
  const { data: atts } = await sb.from("project_task_attachments").select("storage_path").eq("task_id", id);
  if (atts?.length) {
    await sb.storage.from("project-task-attachments").remove(atts.map((a: any) => a.storage_path));
  }
  const { error } = await sb.from("project_tasks").delete().eq("id", id);
  if (error) throw error;
  return { ok: true };
}

export async function uploadTaskAttachment(
  sb: SupabaseClient,
  taskId: string,
  bytes: Uint8Array,
  fileName: string,
  mimeType: string | null = null,
  uploadedBy: string | null = null,
) {
  if (!taskId || !fileName || bytes.byteLength === 0) {
    throw new Error("task_id, file_name, and file content are required");
  }
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const storagePath = `${taskId}/${Date.now()}_${crypto.randomUUID()}_${safeName}`;
  const contentType = mimeType || "application/octet-stream";

  const up = await sb.storage.from("project-task-attachments")
    .upload(storagePath, bytes, { contentType, upsert: false });
  if (up.error) throw up.error;

  const { data, error } = await sb.from("project_task_attachments").insert({
    task_id: taskId,
    storage_path: storagePath,
    file_name: fileName,
    mime_type: mimeType,
    size_bytes: bytes.byteLength,
    uploaded_by: uploadedBy,
  }).select("*").single();
  if (error) throw error;

  const signed = await sb.storage.from("project-task-attachments").createSignedUrl(storagePath, 3600);
  return { ...data, signed_url: signed.data?.signedUrl };
}

export async function listEpics(sb: SupabaseClient, projectId: string) {
  const { data, error } = await sb.from("project_task_epics")
    .select("*").eq("client_project_id", projectId).order("order_index");
  if (error) throw error;
  return data;
}

export async function createEpic(sb: SupabaseClient, projectId: string, name: string, color?: string | null) {
  const { data: maxRow } = await sb.from("project_task_epics")
    .select("order_index").eq("client_project_id", projectId)
    .order("order_index", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await sb.from("project_task_epics").insert({
    client_project_id: projectId,
    name,
    color: color ?? null,
    order_index: (maxRow?.order_index ?? 0) + 1,
  }).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateEpic(sb: SupabaseClient, id: string, patch: { name?: string; color?: string | null; order_index?: number }) {
  const { data, error } = await sb.from("project_task_epics").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteEpic(sb: SupabaseClient, id: string) {
  const { error } = await sb.from("project_task_epics").delete().eq("id", id);
  if (error) throw error;
  return { ok: true };
}
