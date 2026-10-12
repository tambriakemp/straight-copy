// The numbers and words on a project's Payments tab.
//
// Pure, because these are figures a client is billed against. The one
// that matters most: the total is worked out from the INVOICES, not from
// schedule.total_cents. A schedule created from a signed proposal
// carries a total that stops matching the moment someone edits a line,
// and a page that shows "paid $17,500 of $20,000" over invoices adding
// to $18,000 is a page nobody can use to answer "what do they still
// owe".

export interface InvoiceLike {
  amount_cents: number;
  status: string;
  due_date?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
}

export interface ScheduleLike {
  invoices: InvoiceLike[];
}

export interface InvoiceSummary {
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  /** Paid as a percentage of the total, 0–100. */
  pct: number;
  paidCount: number;
  liveCount: number;
  blurb: string;
}

/** Cancelled money is not money, and must not count toward either side. */
function isVoid(i: InvoiceLike): boolean {
  const s = (i.status ?? "").trim().toLowerCase();
  return s === "void" || s === "voided";
}
function isPaid(i: InvoiceLike): boolean {
  return !isVoid(i) && (i.status ?? "").trim().toLowerCase() === "paid";
}

export function invoiceSummary(schedules: ScheduleLike[]): InvoiceSummary {
  const live = schedules.flatMap((s) => s.invoices).filter((i) => !isVoid(i));
  const totalCents = live.reduce((t, i) => t + (i.amount_cents ?? 0), 0);
  const paid = live.filter(isPaid);
  const paidCents = paid.reduce((t, i) => t + (i.amount_cents ?? 0), 0);
  // Floored, so 99.6% reads as 99 — a bar at 100% over an unpaid invoice
  // is the one rounding error that matters here.
  const pct = totalCents > 0 ? Math.floor((paidCents / totalCents) * 100) : 0;

  const n = schedules.length;
  const blurb = !live.length
    ? "No invoices yet. Invoices are sent through SureCart."
    : `${paid.length} of ${live.length} invoice${live.length === 1 ? "" : "s"} paid`
      + ` across ${n} schedule${n === 1 ? "" : "s"}. Invoices are sent through SureCart.`;

  return {
    totalCents, paidCents,
    remainingCents: Math.max(0, totalCents - paidCents),
    pct, paidCount: paid.length, liveCount: live.length, blurb,
  };
}

function d(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The second line of an invoice row: when it is due, when it went, when
 * it was paid — whichever of those has happened.
 *
 * "No due date" is said out loud rather than left blank, because a blank
 * line reads as missing data and someone goes looking for it.
 */
export function invoiceLine(i: InvoiceLike): string {
  const parts: string[] = [];
  const due = d(i.due_date);
  parts.push(due ? `Due ${due}` : "No due date");
  const sent = d(i.sent_at);
  if (sent) parts.push(`Sent ${sent}`);
  const paid = d(i.paid_at);
  if (paid) parts.push(`Paid ${paid}`);
  return parts.join(" · ");
}

/** The chip on an invoice row. */
export const INVOICE_STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "Scheduled", cls: "cv-chip--gray" },
  sent: { label: "Sent", cls: "cv-chip--amber" },
  paid: { label: "Paid", cls: "cv-chip--green" },
  failed: { label: "Failed", cls: "cv-chip--red" },
  void: { label: "Void", cls: "cv-chip--gray" },
};
