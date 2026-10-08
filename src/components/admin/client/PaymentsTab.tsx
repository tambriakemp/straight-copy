// Payments tab (CRE-332 Phase 4) — every payment schedule across every
// project this client has.
//
// project-invoices' "list-schedules" action requires clientProjectId; there
// is no client-level scoping on that edge function (payment schedules live
// in a Drizzle-managed table, not a Supabase one, so this is read-only
// against what already exists — no new edge function or migration). So this
// loops over the client's projects and calls it once per project, same as
// ProjectInvoicesCard.tsx does for one project, then renders the aggregate
// read-only (sending/voiding/emailing a link still happens on the project
// page, where the mutation actions already live).
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Card from "@/components/admin/cv/Card";
import EmptyState from "@/components/admin/cv/EmptyState";
import StatusChip from "@/components/admin/cv/StatusChip";
import type { ClientProjectRow } from "./useClientRecord";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface Invoice {
  id: string;
  sequence: number;
  label: string;
  amount_cents: number;
  due_date: string | null;
  status: string;
}

interface Schedule {
  id: string;
  title: string;
  source: string;
  invoices: Invoice[];
}

const fmtUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function PaymentsTab({
  clientId, projects,
}: { clientId: string; projects: ClientProjectRow[] }) {
  const [loading, setLoading] = useState(true);
  const [byProject, setByProject] = useState<{ project: ClientProjectRow; schedules: Schedule[] }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const results = await Promise.all(projects.map(async (project) => {
        try {
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/project-invoices`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action: "list-schedules", clientId, clientProjectId: project.id }),
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || "Request failed");
          return { project, schedules: (data.schedules ?? []) as Schedule[] };
        } catch (e) {
          toast.error(`${project.name}: ${e instanceof Error ? e.message : "failed to load payments"}`);
          return { project, schedules: [] as Schedule[] };
        }
      }));
      if (!cancelled) { setByProject(results); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [clientId, projects]);

  if (loading) return <div style={{ padding: 24, color: "var(--cv-muted)" }}>Loading…</div>;

  const withSchedules = byProject.filter((b) => b.schedules.length > 0);
  if (withSchedules.length === 0) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No payment schedules yet"
        subtitle="Nothing invoiced on any of this client's projects."
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {withSchedules.map(({ project, schedules }) => (
        <Card key={project.id} className="cv-card-pad">
          <div className="cv-card-head"><span className="cv-card-title">{project.name}</span></div>
          {schedules.map((schedule) => {
            const total = schedule.invoices.reduce((s, i) => s + i.amount_cents, 0);
            const paid = schedule.invoices.filter((i) => i.status === "paid")
              .reduce((s, i) => s + i.amount_cents, 0);
            return (
              <div key={schedule.id} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: "var(--cv-muted)", marginBottom: 8 }}>
                  {schedule.title} · {fmtUSD(paid)} of {fmtUSD(total)}
                </div>
                <div className="cv-simple-list">
                  {schedule.invoices.map((inv) => (
                    <div key={inv.id} className="cv-simple-list__row">
                      <span className="cv-simple-list__main">
                        <span className="cv-simple-list__title">{inv.label}</span>
                        <span className="cv-simple-list__sub">
                          {inv.due_date ? `Due ${new Date(inv.due_date).toLocaleDateString()}` : "No due date"}
                        </span>
                      </span>
                      <span className="cv-simple-list__when">{fmtUSD(inv.amount_cents)}</span>
                      <StatusChip label={inv.status} status={inv.status} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </Card>
      ))}
    </div>
  );
}
