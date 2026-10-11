// Everything the client page draws: the client row, their projects, the
// task counts behind each project's bar, the notes and logins the tabs
// count, and the balance on the dark card.
//
// Three Supabase queries plus one edge-function call per project. The
// per-project call is not a choice: payment schedules live in a
// Drizzle-managed table reached through project-invoices, which only
// scopes by clientProjectId — there is no client-level action to ask for.
// PaymentsTab did the same thing; this replaces it rather than adding a
// second copy.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { countByProject, type TaskCounts, type TaskRow } from "@/lib/taskCounts";
import { summarise, NO_BALANCE, type BalanceInvoice, type ClientBalance } from "@/lib/clientBalance";
import { isMissingColumn, isMissingRelation } from "@/lib/missingColumn";
import type { ClientLoginRow } from "@/lib/clientLogins";

// Same reason as the Clients list: `internal` is one migration ahead of
// whatever Lovable has applied, and a select naming a column the database
// does not have is rejected whole. See @/lib/missingColumn.
const CLIENT_COLUMNS =
  "id, business_name, contact_name, contact_email, contact_phone, archived, created_at, tier, pipeline_stage, notes";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface ClientRecord {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  archived: boolean;
  internal: boolean;
  created_at: string;
  tier: string;
  pipeline_stage: string;
  notes: string | null;
}

export interface ClientProjectRow {
  id: string;
  name: string;
  type: string;
  status: string;
  company_id: string | null;
  business_name: string | null;
  created_at: string;
}

export interface ClientNote {
  id: string;
  body: string;
  created_at: string;
  /**
   * Set on a note written against a project rather than the client.
   * Those are read-only here — they belong to the project page, which is
   * where they can be edited — but they are SHOWN here, because a note is
   * a note and hiding half of them behind another page is how you lose
   * one.
   */
  project?: { id: string; name: string };
}

export function useClientRecord(clientId: string) {
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [projects, setProjects] = useState<ClientProjectRow[]>([]);
  const [counts, setCounts] = useState<Map<string, TaskCounts>>(new Map());
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [logins, setLogins] = useState<ClientLoginRow[]>([]);
  const [balance, setBalance] = useState<ClientBalance>(NO_BALANCE);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, p] = await Promise.all([
      loadClient(clientId),
      supabase.from("client_projects")
        .select("id, name, type, status, company_id, business_name, created_at")
        .eq("client_id", clientId).order("created_at", { ascending: false }),
    ]);
    if (c.error) toast.error(c.error.message);
    if (p.error) toast.error(p.error.message);
    const projectRows = (p.data ?? []) as ClientProjectRow[];
    setClient(c.data);
    setProjects(projectRows);

    // Notes and logins hang off the client, not its projects, so they are
    // loaded whether or not there are any projects — a client with no
    // project still has an inbox login you need.
    const projectIds = projectRows.map((r) => r.id);
    const [n, pn, g] = await Promise.all([
      supabase.from("client_notes").select("id, body, created_at")
        .eq("client_id", clientId).order("created_at", { ascending: false }),
      // Notes written on this client's projects. Shown here too, named by
      // project and read-only: they are the same thing to the person
      // reading, and splitting them across two pages is how one gets lost.
      projectIds.length
        ? supabase.from("project_notes").select("id, body, created_at, client_project_id")
            .in("client_project_id", projectIds).order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      supabase.from("client_logins_list")
        .select("id, label, url, username, note, has_password")
        .eq("client_id", clientId).order("created_at", { ascending: true }),
    ]);
    // Reported, not thrown: losing the notes should not cost the page its
    // projects. A missing table is swallowed entirely — these two arrive
    // with a migration Lovable has not necessarily applied yet, and an
    // error toast on every page load would be worse than an empty tab.
    for (const r of [n, pn, g]) if (r.error && !isMissingRelation(r.error)) toast.error(r.error.message);
    const byProject = new Map(projectRows.map((r) => [r.id, r.name]));
    const merged: ClientNote[] = [
      ...((n.data ?? []) as ClientNote[]),
      ...((pn.data ?? []) as Array<{ id: string; body: string; created_at: string; client_project_id: string }>)
        .map((r) => ({
          id: r.id, body: r.body, created_at: r.created_at,
          project: { id: r.client_project_id, name: byProject.get(r.client_project_id) ?? "Project" },
        })),
    ].sort((a, b) => b.created_at.localeCompare(a.created_at));
    setNotes(merged);
    setLogins(((g.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id), label: String(r.label ?? ""),
      url: (r.url as string | null) ?? null,
      username: (r.username as string | null) ?? null,
      note: (r.note as string | null) ?? null,
      has_password: Boolean(r.has_password),
    })));

    const ids = projectRows.map((r) => r.id);
    if (!ids.length) {
      setCounts(new Map()); setBalance(NO_BALANCE);
      setLoading(false);
      return;
    }

    const t = await supabase.from("project_tasks")
      .select("client_project_id, status").in("client_project_id", ids);
    if (t.error) toast.error(t.error.message);
    setCounts(countByProject((t.data ?? []) as TaskRow[]));
    setLoading(false);

    // Money last and on its own, because it is the slow part — a round
    // trip per project — and the page is usable without it.
    void loadBalance(clientId, projectRows).then(setBalance);
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  return { client, projects, counts, notes, logins, balance, loading, reload: load };
}

async function loadClient(
  clientId: string,
): Promise<{ data: ClientRecord | null; error: { message: string } | null }> {
  const withInternal = await supabase.from("clients")
    .select(`${CLIENT_COLUMNS}, internal`).eq("id", clientId).maybeSingle();
  if (!isMissingColumn(withInternal.error)) {
    return { data: (withInternal.data ?? null) as ClientRecord | null, error: withInternal.error };
  }
  const without = await supabase.from("clients")
    .select(CLIENT_COLUMNS).eq("id", clientId).maybeSingle();
  return {
    data: without.data ? ({ ...without.data, internal: false } as ClientRecord) : null,
    error: without.error,
  };
}

async function loadBalance(clientId: string, projects: ClientProjectRow[]): Promise<ClientBalance> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const all: BalanceInvoice[] = [];
  await Promise.all(projects.map(async (project) => {
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/project-invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "list-schedules", clientId, clientProjectId: project.id }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Request failed");
      for (const schedule of (data.schedules ?? []) as Array<{ title: string; invoices: BalanceInvoice[] }>) {
        for (const invoice of schedule.invoices ?? []) {
          all.push({ ...invoice, scheduleTitle: schedule.title, projectName: project.name });
        }
      }
    } catch (e) {
      // One project's schedules failing should not blank the card for the
      // rest, and it is not worth a toast on a page you only passed through.
      console.warn(`payments for ${project.name}:`, e);
    }
  }));
  return summarise(all);
}
