// Shared data for the new client detail page (CRE-332 Phase 4) — the client
// row and its projects, loaded once and handed to whichever tab needs them.
// Read-only: no table here is new, and nothing here writes.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export interface ClientRecord {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  archived: boolean;
  created_at: string;
  tier: string;
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

export function useClientRecord(clientId: string) {
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [projects, setProjects] = useState<ClientProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, p] = await Promise.all([
      supabase.from("clients")
        .select("id, business_name, contact_name, contact_email, contact_phone, archived, created_at, tier")
        .eq("id", clientId).maybeSingle(),
      supabase.from("client_projects")
        .select("id, name, type, status, company_id, business_name, created_at")
        .eq("client_id", clientId).order("created_at", { ascending: false }),
    ]);
    if (c.error) toast.error(c.error.message);
    if (p.error) toast.error(p.error.message);
    setClient((c.data ?? null) as ClientRecord | null);
    setProjects((p.data ?? []) as ClientProjectRow[]);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  return { client, projects, loading, reload: load };
}
