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
import { isMissingColumn } from "@/lib/missingColumn";

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

export interface ProjectNote {
  id: string;
  client_project_id: string;
  body: string;
  created_at: string;
}

export interface ProjectSecret {
  client_project_id: string;
  key: string;
  hint: string | null;
  updated_at: string;
}

export function useClientRecord(clientId: string) {
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [projects, setProjects] = useState<ClientProjectRow[]>([]);
  const [counts, setCounts] = useState<Map<string, TaskCounts>>(new Map());
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [secrets, setSecrets] = useState<ProjectSecret[]>([]);
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

    const ids = projectRows.map((r) => r.id);
    if (!ids.length) {
      setCounts(new Map()); setNotes([]); setSecrets([]); setBalance(NO_BALANCE);
      setLoading(false);
      return;
    }

    const [t, n, s] = await Promise.all([
      supabase.from("project_tasks").select("client_project_id, status").in("client_project_id", ids),
      supabase.from("project_notes").select("id, client_project_id, body, created_at")
        .in("client_project_id", ids).order("created_at", { ascending: false }),
      supabase.from("project_secrets").select("client_project_id, key, hint, updated_at")
        .in("client_project_id", ids),
    ]);
    // Reported, not thrown: losing the notes count should not cost the page
    // its projects.
    for (const r of [t, n, s]) if (r.error) toast.error(r.error.message);
    setCounts(countByProject((t.data ?? []) as TaskRow[]));
    setNotes((n.data ?? []) as ProjectNote[]);
    setSecrets((s.data ?? []) as ProjectSecret[]);
    setLoading(false);

    // Money last and on its own, because it is the slow part — a round
    // trip per project — and the page is usable without it.
    void loadBalance(clientId, projectRows).then(setBalance);
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  return { client, projects, counts, notes, secrets, balance, loading, reload: load };
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
