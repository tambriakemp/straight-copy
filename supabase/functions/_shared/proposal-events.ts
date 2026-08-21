// One timeline per proposal.
//
// A proposal's life is spread across four systems: the CRM writes it, storage
// holds the PDF, SureContact sends and tracks the email, and the portal records
// the signature. Answering "did they even open it?" meant checking all four.
// Every one of those moments now lands here instead, so the admin panel and the
// agent read the same list in the same order.
//
// Best-effort by design: logging must never be the reason a send or a signature
// fails, so every write swallows its error and reports it in the return value.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

export type ProposalEventType =
  | "drafted"
  | "updated"
  | "project_attached"
  | "pdf_uploaded"
  | "email_queued"
  | "email_sent"
  | "email_delivered"
  | "email_opened"
  | "link_clicked"
  | "viewed_in_portal"
  | "signed"
  | "countersigned"
  | "followup_scheduled"
  | "followup_sent"
  | "declined"
  | "voided";

/** Ordered roughly as a proposal progresses, for rendering a lifecycle bar. */
export const LIFECYCLE_ORDER: ProposalEventType[] = [
  "drafted",
  "project_attached",
  "pdf_uploaded",
  "email_queued",
  "email_sent",
  "email_delivered",
  "email_opened",
  "link_clicked",
  "viewed_in_portal",
  "signed",
  "countersigned",
];

export interface LogProposalEventInput {
  proposal_id: string;
  client_id?: string | null;
  event_type: ProposalEventType;
  /** 'admin' | 'client' | 'system' | an agent key. */
  actor?: string | null;
  occurred_at?: string;
  detail?: Record<string, unknown>;
}

export async function logProposalEvent(
  sb: SupabaseClient,
  input: LogProposalEventInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await sb.from("proposal_events").insert({
      proposal_id: input.proposal_id,
      client_id: input.client_id ?? null,
      event_type: input.event_type,
      actor: input.actor ?? "system",
      occurred_at: input.occurred_at ?? new Date().toISOString(),
      detail: input.detail ?? {},
    });
    if (error) {
      console.error("[proposal-events] insert failed", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = String((e as Error).message || e);
    console.error("[proposal-events] insert threw", msg);
    return { ok: false, error: msg };
  }
}

/**
 * Human-readable one-liner for an event. Used by the admin panel and by the
 * agent's context so both describe the same event the same way.
 */
export function describeProposalEvent(
  e: { event_type: string; actor?: string | null; detail?: Record<string, unknown> | null },
): string {
  const d = e.detail ?? {};
  switch (e.event_type) {
    case "drafted": return "Draft written";
    case "updated": return "Draft edited";
    case "project_attached": return `Attached to project${d.project_name ? ` — ${d.project_name}` : ""}`;
    case "pdf_uploaded": return "PDF uploaded";
    case "email_queued": return `Send queued to ${d.to ?? "client"}`;
    case "email_sent": return `Email sent to ${d.to ?? "client"}`;
    case "email_delivered": return "Email delivered";
    case "email_opened": return "Client opened the email";
    case "link_clicked": return `Client clicked${d.url ? ` — ${d.url}` : " the link"}`;
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
