// Proposals tab — every proposal across every project this client has
// (CRE-332 Phase 4). Read-only: calls proposal-sign's existing "list" action
// with clientId only (clientProjectId is optional there), rather than the
// full upload/send/void panel in ProjectProposalsPanel.tsx, which is scoped
// to one project and built for mutation. Full actions still live there, on
// the project page.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileSignature } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Card from "@/components/admin/cv/Card";
import EmptyState from "@/components/admin/cv/EmptyState";
import StatusChip from "@/components/admin/cv/StatusChip";
import type { ClientProjectRow } from "./useClientRecord";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface Proposal {
  id: string;
  client_project_id: string;
  title: string;
  status: string;
  total_cents: number | null;
  created_at: string;
  sent_at: string | null;
  client_signed_at: string | null;
  agency_countersigned_at: string | null;
}

const fmtUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

export default function ProposalsTab({
  clientId, projects,
}: { clientId: string; projects: ClientProjectRow[] }) {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/proposal-sign`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: "list", clientId }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "Request failed");
        if (!cancelled) setProposals((data.proposals ?? []) as Proposal[]);
      } catch (e) {
        if (!cancelled) {
          // Archived clients 404 here by design (proposal-sign treats them
          // as not found) — that reads as "nothing to show", not an error.
          const msg = e instanceof Error ? e.message : "Failed to load proposals";
          if (msg !== "Client not found") toast.error(msg);
          setProposals([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? null;

  if (proposals === null) {
    return <div style={{ padding: 24, color: "var(--cv-muted)" }}>Loading…</div>;
  }

  return (
    <Card className="cv-card-pad">
      <div className="cv-card-head">
        <span className="cv-card-title">Proposals</span>
        <span className="cv-card-sub">{proposals.length}</span>
      </div>
      {proposals.length === 0 ? (
        <EmptyState icon={FileSignature} title="No proposals yet" />
      ) : (
        <div className="cv-simple-list">
          {proposals.map((p) => (
            <div key={p.id} className="cv-simple-list__row">
              <span className="cv-simple-list__main">
                <span className="cv-simple-list__title">{p.title}</span>
                <span className="cv-simple-list__sub">
                  {projectName(p.client_project_id) ?? "Unknown project"} · {fmtDate(p.created_at)}
                  {p.total_cents != null ? ` · ${fmtUSD(p.total_cents)}` : ""}
                  {p.sent_at ? ` · sent ${fmtDate(p.sent_at)}` : ""}
                  {p.client_signed_at ? ` · signed ${fmtDate(p.client_signed_at)}` : ""}
                  {p.agency_countersigned_at ? ` · countersigned ${fmtDate(p.agency_countersigned_at)}` : ""}
                </span>
              </span>
              <StatusChip label={p.status} status={p.status} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
