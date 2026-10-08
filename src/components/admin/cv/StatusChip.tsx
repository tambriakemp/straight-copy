// One status -> tone map shared across the new .cv-admin pages, per the
// CRE-332 brief. Extend this map rather than inventing a one-off color.
export type StatusTone = "amber" | "green" | "red" | "blue" | "violet" | "gray" | "bronze";

const STATUS_TONE: Record<string, StatusTone> = {
  pending: "amber",
  hold: "amber",
  due: "amber",
  approved: "green",
  paid: "green",
  done: "green",
  rejected: "red",
  overdue: "red",
  info: "blue",
  profile: "blue",
  question: "violet",
  paused: "gray",
  "needs-you": "bronze",
  drafts: "bronze",
  // Proposal statuses (client_proposals.status) and invoice statuses
  // (project_invoices.status) — added for the client detail page's
  // Proposals and Payments tabs (CRE-332 Phase 4).
  ready: "blue",
  sent: "amber",
  signed: "green",
  voided: "red",
  declined: "red",
  superseded: "gray",
  scheduled: "gray",
  void: "red",
  failed: "red",
};

export function toneForStatus(status: string): StatusTone {
  return STATUS_TONE[status] ?? "gray";
}

export default function StatusChip({
  label,
  tone,
  status,
}: {
  label: string;
  /** Pass an explicit tone, or a status key to look up via the shared map. */
  tone?: StatusTone;
  status?: string;
}) {
  const resolved = tone ?? (status ? toneForStatus(status) : "gray");
  return <span className={`cv-chip cv-chip--${resolved}`}>{label}</span>;
}
