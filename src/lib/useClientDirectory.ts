// Every client, their projects and the task counts behind both — the data
// the Clients list draws.
//
// Three queries, not one per client. The old page loaded clients and then
// let each card fetch its own projects, which is a query per row on a page
// whose whole job is to show you all the rows at once.
//
// Task rows come back as id + project + status only. That is one row per
// task across the whole agency, which sounds like a lot until you notice
// the page prints a count for every project on it: the alternative is a
// count query per project, and there are more projects than there are
// useful ways to batch them.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { countByProject, type TaskCounts, type TaskRow } from "@/lib/taskCounts";
import { isMissingColumn } from "@/lib/missingColumn";

// `internal` arrived with the 20261011 migration, which Lovable applies on
// its own schedule — so between the push and that deploy the column is not
// there and a select naming it is rejected whole. Asked for separately and
// dropped when the database has not caught up: a missing Internal pill is
// a smaller problem than an empty Clients page. See @/lib/missingColumn.
const CLIENT_COLUMNS = "id, business_name, contact_name, contact_email, archived, created_at, tier";

export interface DirectoryClient {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  archived: boolean;
  /** Our own books rather than a client's — see the 20261011 migration. */
  internal: boolean;
  created_at: string;
  tier: string | null;
}

export interface DirectoryProject {
  id: string;
  client_id: string;
  name: string;
  type: string;
  status: string;
}

export interface ClientDirectory {
  clients: DirectoryClient[];
  /** Keyed by client id, newest project first. */
  projectsByClient: Map<string, DirectoryProject[]>;
  counts: Map<string, TaskCounts>;
  loading: boolean;
  reload: () => void;
}

export function useClientDirectory(): ClientDirectory {
  const [clients, setClients] = useState<DirectoryClient[]>([]);
  const [projectsByClient, setProjectsByClient] = useState<Map<string, DirectoryProject[]>>(new Map());
  const [counts, setCounts] = useState<Map<string, TaskCounts>>(new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, p, t] = await Promise.all([
      loadClients(),
      supabase.from("client_projects")
        .select("id, client_id, name, type, status")
        .order("created_at", { ascending: false }),
      supabase.from("project_tasks").select("client_project_id, status"),
    ]);
    // Reported, not thrown: a failed task query should cost the page its
    // progress bars, not its client list.
    for (const r of [c, p, t]) if (r.error) toast.error(r.error.message);

    setClients(c.data ?? []);

    const grouped = new Map<string, DirectoryProject[]>();
    for (const row of (p.data ?? []) as DirectoryProject[]) {
      const list = grouped.get(row.client_id) ?? [];
      list.push(row);
      grouped.set(row.client_id, list);
    }
    setProjectsByClient(grouped);
    setCounts(countByProject((t.data ?? []) as TaskRow[]));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { clients, projectsByClient, counts, loading, reload: () => { void load(); } };
}

async function loadClients(): Promise<{ data: DirectoryClient[] | null; error: { message: string } | null }> {
  const withInternal = await supabase.from("clients")
    .select(`${CLIENT_COLUMNS}, internal`)
    .order("created_at", { ascending: false });
  if (!isMissingColumn(withInternal.error)) {
    return { data: (withInternal.data ?? null) as DirectoryClient[] | null, error: withInternal.error };
  }
  const without = await supabase.from("clients")
    .select(CLIENT_COLUMNS)
    .order("created_at", { ascending: false });
  return {
    data: (without.data ?? []).map((row) => ({ ...row, internal: false })) as DirectoryClient[],
    error: without.error,
  };
}
