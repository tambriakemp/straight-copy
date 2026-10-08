// Intake tab — client-level intake data (CRE-332 Phase 4). There is no
// reusable per-client intake hook yet, so this replicates the load
// AutomationBuildView.tsx does (clients.* intake columns + journey_nodes +
// client_email_tracking), read-only. This is client-level, not per-project —
// a client with several projects has one intake record, shown once here.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Card from "@/components/admin/cv/Card";
import EmptyState from "@/components/admin/cv/EmptyState";
import StatusChip from "@/components/admin/cv/StatusChip";

interface IntakeClient {
  intake_summary: string | null;
  brand_kit_intake: unknown;
  brand_kit_intake_submitted_at: string | null;
  onboarding_submission_id: string | null;
  kickoff_webhook_fired_at: string | null;
  kickoff_webhook_confirmed_at: string | null;
  build_start_date: string | null;
  delivery_date: string | null;
  brand_voice_status: string;
  brand_voice_approved: boolean;
  brand_voice_approved_at: string | null;
}

interface JourneyNode {
  id: string;
  label: string;
  status: string;
  order_index: number;
  completed_at: string | null;
}

interface EmailTracking {
  welcome_sent_at: string | null; welcome_opened_at: string | null;
  scope_sent_at: string | null; scope_opened_at: string | null;
  kickoff_sent_at: string | null; kickoff_opened_at: string | null;
  day3_sent_at: string | null; day3_opened_at: string | null;
  delivery_sent_at: string | null; delivery_opened_at: string | null;
}

function fmtDateTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString() : "—";
}

function nodeTone(status: string) {
  if (status === "complete" || status === "done") return "green" as const;
  if (status === "in_progress" || status === "active") return "blue" as const;
  return "gray" as const;
}

export default function IntakeTab({ clientId }: { clientId: string }) {
  const [client, setClient] = useState<IntakeClient | null>(null);
  const [nodes, setNodes] = useState<JourneyNode[]>([]);
  const [tracking, setTracking] = useState<EmailTracking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // select("*") rather than a long explicit column list — Supabase-js's
      // select-string type inference chokes on lists this long and falls
      // back to a useless `GenericStringError` type. The explicit columns
      // this tab actually reads are documented on IntakeClient below.
      const [c, n, t] = await Promise.all([
        supabase.from("clients").select("*").eq("id", clientId).maybeSingle(),
        supabase.from("journey_nodes").select("id, label, status, order_index, completed_at")
          .eq("client_id", clientId).order("order_index"),
        supabase.from("client_email_tracking").select("*").eq("client_id", clientId).maybeSingle(),
      ]);
      if (cancelled) return;
      if (c.error) toast.error(c.error.message);
      if (n.error) toast.error(n.error.message);
      setClient((c.data ?? null) as unknown as IntakeClient | null);
      setNodes((n.data ?? []) as JourneyNode[]);
      setTracking((t.data ?? null) as EmailTracking | null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (loading) return <div style={{ padding: 24, color: "var(--cv-muted)" }}>Loading…</div>;
  if (!client) return <EmptyState icon={ClipboardList} title="No intake data" />;

  const emailRows = tracking ? [
    { key: "welcome", label: "Welcome", sent: tracking.welcome_sent_at, opened: tracking.welcome_opened_at },
    { key: "scope", label: "Scope summary", sent: tracking.scope_sent_at, opened: tracking.scope_opened_at },
    { key: "kickoff", label: "Kickoff confirmation", sent: tracking.kickoff_sent_at, opened: tracking.kickoff_opened_at },
    { key: "day3", label: "Build update (Day 3)", sent: tracking.day3_sent_at, opened: tracking.day3_opened_at },
    { key: "delivery", label: "Delivery (AI OS is live)", sent: tracking.delivery_sent_at, opened: tracking.delivery_opened_at },
  ] : [];

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card className="cv-card-pad">
        <div className="cv-card-head"><span className="cv-card-title">Intake</span></div>
        <p style={{ fontSize: 13, color: "var(--cv-muted)", margin: "-6px 0 14px" }}>
          Client-level — one intake record shared across every project this client has.
        </p>
        <dl className="cv-dl">
          <dt>Summary</dt><dd>{client.intake_summary || "—"}</dd>
          <dt>Brand kit intake</dt>
          <dd>{client.brand_kit_intake ? `Submitted ${fmtDateTime(client.brand_kit_intake_submitted_at)}` : "Not submitted"}</dd>
          <dt>Onboarding submission</dt><dd>{client.onboarding_submission_id || "—"}</dd>
          <dt>Kickoff webhook</dt>
          <dd>
            {client.kickoff_webhook_fired_at
              ? `Fired ${fmtDateTime(client.kickoff_webhook_fired_at)}${client.kickoff_webhook_confirmed_at ? `, confirmed ${fmtDateTime(client.kickoff_webhook_confirmed_at)}` : ""}`
              : "Not fired yet"}
          </dd>
          <dt>Build start</dt><dd>{client.build_start_date ? fmtDateTime(client.build_start_date) : "—"}</dd>
          <dt>Delivery date</dt><dd>{client.delivery_date ? fmtDateTime(client.delivery_date) : "—"}</dd>
          <dt>Brand voice</dt>
          <dd>
            <StatusChip label={client.brand_voice_status} tone={client.brand_voice_approved ? "green" : "amber"} />
            {client.brand_voice_approved_at ? ` · approved ${fmtDateTime(client.brand_voice_approved_at)}` : ""}
          </dd>
        </dl>
      </Card>

      <Card className="cv-card-pad">
        <div className="cv-card-head">
          <span className="cv-card-title">Journey checklist</span>
          <span className="cv-card-sub">{nodes.length}</span>
        </div>
        {nodes.length === 0 ? (
          <EmptyState title="No journey nodes yet" />
        ) : (
          <div className="cv-simple-list">
            {nodes.map((n) => (
              <div key={n.id} className="cv-simple-list__row">
                <span className="cv-simple-list__main">
                  <span className="cv-simple-list__title">{n.label}</span>
                </span>
                <span className="cv-simple-list__when">{n.completed_at ? fmtDateTime(n.completed_at) : "—"}</span>
                <StatusChip label={n.status} tone={nodeTone(n.status)} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="cv-card-pad">
        <div className="cv-card-head"><span className="cv-card-title">Email tracking</span></div>
        {!tracking ? (
          <EmptyState title="No tracking data yet" />
        ) : (
          <div className="cv-simple-list">
            {emailRows.map((row) => (
              <div key={row.key} className="cv-simple-list__row">
                <span className="cv-simple-list__main">
                  <span className="cv-simple-list__title">{row.label}</span>
                  <span className="cv-simple-list__sub">
                    {row.sent ? `Sent ${fmtDateTime(row.sent)}` : "Not sent"}
                  </span>
                </span>
                <StatusChip
                  label={row.opened ? "Opened" : row.sent ? "Sent" : "Pending"}
                  tone={row.opened ? "green" : row.sent ? "blue" : "gray"}
                />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
