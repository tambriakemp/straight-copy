// Everything the project page draws, in one place: the project and its
// client, the task counts behind the four stat cards, the two task lists
// the Overview shows, the project's links (which is where the agent board
// is recorded) and its notes.
//
// Tasks are selected with their names, unlike the Clients list's count-only
// query, because this page prints them.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { countByProject, countsFor, EMPTY_COUNTS, type TaskCounts, type TaskStatus } from "@/lib/taskCounts";

export interface ProjectRecord {
  id: string;
  client_id: string;
  name: string;
  type: string;
  status: string;
  repo_url: string | null;
  agent_autonomy: string | null;
  queue_enabled: boolean;
  notes: string | null;
}

export interface ProjectClient {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
}

export interface ProjectTask {
  id: string;
  name: string;
  status: TaskStatus;
  updated_at: string;
}

export interface ProjectLink { id: string; label: string; url: string }
export interface ProjectNote { id: string; body: string; created_at: string }

export interface ProjectRecordState {
  project: ProjectRecord | null;
  client: ProjectClient | null;
  counts: TaskCounts;
  needsReview: ProjectTask[];
  blocked: ProjectTask[];
  links: ProjectLink[];
  notes: ProjectNote[];
  loading: boolean;
  notFound: boolean;
  reload: () => void;
}

export function useProjectRecord(projectId: string | undefined): ProjectRecordState {
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [client, setClient] = useState<ProjectClient | null>(null);
  const [counts, setCounts] = useState<TaskCounts>(EMPTY_COUNTS);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setNotFound(false);
    const { data: p, error } = await supabase
      .from("client_projects")
      .select("id, client_id, name, type, status, repo_url, agent_autonomy, queue_enabled, notes")
      .eq("id", projectId).maybeSingle();
    if (error) toast.error(error.message);
    if (!p) { setNotFound(true); setLoading(false); return; }
    const row = p as ProjectRecord;
    setProject(row);

    const [c, t, l, n] = await Promise.all([
      supabase.from("clients").select("id, business_name, contact_name, contact_email")
        .eq("id", row.client_id).maybeSingle(),
      supabase.from("project_tasks").select("id, name, status, updated_at")
        .eq("client_project_id", projectId).order("updated_at", { ascending: false }),
      supabase.from("project_links").select("id, label, url")
        .eq("client_project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("project_notes").select("id, body, created_at")
        .eq("client_project_id", projectId).order("created_at", { ascending: false }),
    ]);
    // Reported, not thrown: losing the notes should not cost the page its
    // task counts.
    for (const r of [c, t, l, n]) if (r.error) toast.error(r.error.message);

    setClient((c.data ?? null) as ProjectClient | null);
    const taskRows = (t.data ?? []) as ProjectTask[];
    setTasks(taskRows);
    setCounts(countsFor(
      countByProject(taskRows.map((r) => ({ client_project_id: projectId, status: r.status }))),
      projectId,
    ));
    setLinks((l.data ?? []) as ProjectLink[]);
    setNotes((n.data ?? []) as ProjectNote[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  return {
    project, client, counts,
    needsReview: tasks.filter((t) => t.status === "needs_review"),
    blocked: tasks.filter((t) => t.status === "blocked"),
    links, notes, loading, notFound, reload: load,
  };
}
