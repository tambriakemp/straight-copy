// The engagement timeline for one proposal.
//
// Answers the question the proposal list can't: they were sent it — did they
// read it? Draft, send, delivery, open, click, portal view and signature all
// land in proposal_events, so this is one query rather than a join across the
// CRM, the email log and SureContact.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type ProposalEvent = {
  id: string;
  event_type: string;
  actor: string | null;
  occurred_at: string;
  detail: Record<string, unknown> | null;
};

/** Client-side mirror of describeProposalEvent in _shared/proposal-events.ts. */
function describe(e: ProposalEvent): string {
  const d = (e.detail ?? {}) as Record<string, string | undefined>;
  switch (e.event_type) {
    case "drafted": return "Draft written";
    case "updated": return "Draft edited";
    case "project_attached": return `Attached to project${d.project_name ? ` — ${d.project_name}` : ""}`;
    case "pdf_uploaded": return d.generated ? "PDF generated" : "PDF uploaded";
    case "email_queued": return `Send queued to ${d.to ?? "client"}`;
    case "email_sent": return `Email sent to ${d.to ?? "client"}`;
    case "email_delivered": return "Email delivered";
    case "email_opened": return "Client opened the email";
    case "link_clicked": return d.url ? `Client clicked — ${d.url}` : "Client clicked the link";
    case "viewed_in_portal": return "Opened in the portal";
    case "signed": return `Signed${d.name ? ` by ${d.name}` : ""}`;
    case "countersigned": return `Countersigned${d.name ? ` by ${d.name}` : ""}`;
    case "followup_scheduled": return `Follow-up set for ${d.due_date ?? "later"}`;
    case "followup_sent": return "Follow-up sent";
    case "declined":
      return `Client declined${d.reason ? ` — "${d.reason}"` : ""}`;
    case "voided": return "Voided";
    default: return e.event_type.replace(/_/g, " ");
  }
}

// Events the client caused are the ones worth noticing, so they carry the
// accent. Everything we did ourselves stays quiet.
const CLIENT_EVENTS = new Set([
  "email_opened", "link_clicked", "viewed_in_portal", "signed", "declined",
]);

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ProposalActivityLog({ proposalId }: { proposalId: string }) {
  const [events, setEvents] = useState<ProposalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("proposal_events")
        .select("id, event_type, actor, occurred_at, detail")
        .eq("proposal_id", proposalId)
        .order("occurred_at", { ascending: false })
        .limit(100);
      if (!cancelled) {
        setEvents((data ?? []) as ProposalEvent[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [proposalId]);

  if (loading) {
    return <p style={{ fontSize: 14, color: "var(--crm-taupe)" }}>Loading activity…</p>;
  }
  if (!events.length) {
    return (
      <p style={{ fontSize: 14, color: "var(--crm-taupe)" }}>
        No activity recorded yet.
      </p>
    );
  }

  return (
    <ol className="prop-log">
      {events.map((e) => {
        const isClient = CLIENT_EVENTS.has(e.event_type);
        return (
          <li key={e.id} className={`prop-log__row${isClient ? " prop-log__row--client" : ""}`}>
            <span className="prop-log__dot" />
            <span className="prop-log__text">{describe(e)}</span>
            <span className="prop-log__when" title={new Date(e.occurred_at).toLocaleString()}>
              {relTime(e.occurred_at)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
