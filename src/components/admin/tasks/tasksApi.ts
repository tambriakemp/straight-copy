import { supabase } from "@/integrations/supabase/client";

export const TASK_STATUSES = [
  "backlog", "ready_for_claude", "in_progress", "needs_review", "blocked", "complete",
] as const;
export type TaskStatus = typeof TASK_STATUSES[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  ready_for_claude: "Ready for Claude",
  in_progress: "In Progress",
  needs_review: "Needs Review",
  blocked: "Blocked",
  complete: "Complete",
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  backlog: "hsl(30 8% 62%)",
  ready_for_claude: "hsl(200 70% 55%)",
  in_progress: "hsl(45 90% 55%)",
  needs_review: "hsl(280 50% 60%)",
  blocked: "hsl(0 65% 55%)",
  complete: "hsl(140 50% 50%)",
};

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = typeof PRIORITIES[number];

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: "hsl(200 20% 55%)",
  normal: "hsl(30 8% 62%)",
  high: "hsl(35 80% 55%)",
  urgent: "hsl(0 70% 55%)",
};

export type AssigneeKind = "unassigned" | "admin" | "claude" | "auto" | "client" | "agency";

export interface Epic {
  id: string;
  client_project_id: string;
  name: string;
  color: string | null;
  order_index: number;
  journey_stage_key?: string | null;
  locked?: boolean;
}

export interface Attachment {
  id: string;
  task_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  signed_url?: string;
  created_at: string;
}

export const TASK_SIZES = ["S", "M", "L"] as const;
export type TaskSize = typeof TASK_SIZES[number];
export const TASK_PLATFORMS = ["web", "native", "backend", "all"] as const;
export type TaskPlatform = typeof TASK_PLATFORMS[number];

export interface AcceptanceCriterion {
  id: string;
  text: string;
  done: boolean;
}

export interface Task {
  id: string;
  client_project_id: string;
  parent_task_id: string | null;
  epic_id: string | null;
  name: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_kind: AssigneeKind;
  assignee_admin_id: string | null;
  url: string | null;
  due_date: string | null;
  tags: string[];
  order_index: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  acceptance_criteria: AcceptanceCriterion[];
  design_url: string | null;
  blocked_by: string[];
  manual_prereqs: string | null;
  size: TaskSize | null;
  platform: TaskPlatform | null;
  attachments?: Attachment[];
  journey_item_key?: string | null;
  auto_key?: string | null;
}

async function invoke<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in");
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/project-tasks${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* */ }
  if (!res.ok) throw new Error(data?.error ?? res.statusText);
  return data as T;
}

export const tasksApi = {
  list: (projectId: string) =>
    invoke<{ tasks: Task[]; epics: Epic[] }>(`/tasks?project_id=${encodeURIComponent(projectId)}`),
  create: (input: Partial<Task> & { client_project_id: string; name: string }) =>
    invoke<{ task: Task }>(`/tasks`, { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, patch: Partial<Task>) =>
    invoke<{ task: Task }>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  remove: (id: string) =>
    invoke<{ ok: true }>(`/tasks/${id}`, { method: "DELETE" }),

  uploadAttachment: async (taskId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return invoke<{ attachment: Attachment }>(`/tasks/${taskId}/attachments`, {
      method: "POST", body: fd,
    });
  },
  deleteAttachment: (id: string) =>
    invoke<{ ok: true }>(`/attachments/${id}`, { method: "DELETE" }),

  listEpics: (projectId: string) =>
    invoke<{ epics: Epic[] }>(`/epics?project_id=${encodeURIComponent(projectId)}`),
  createEpic: (projectId: string, name: string, color?: string) =>
    invoke<{ epic: Epic }>(`/epics`, {
      method: "POST",
      body: JSON.stringify({ client_project_id: projectId, name, color }),
    }),
  updateEpic: (id: string, patch: Partial<Epic>) =>
    invoke<{ epic: Epic }>(`/epics/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteEpic: (id: string) =>
    invoke<{ ok: true }>(`/epics/${id}`, { method: "DELETE" }),
};
