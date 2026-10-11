// What the dark "Balance due" card on the client page says.
//
// Pure, because every line on that card is a decision about money and all
// of them look plausible when wrong. Whether a voided invoice still counts
// toward the total (it does not — it was cancelled, and leaving it in makes
// the client look like they owe money nobody is going to ask them for).
// Which of several unpaid invoices is "the" next one. What the bar shows
// when nothing has been invoiced yet.

export interface BalanceInvoice {
  id: string;
  label: string;
  amount_cents: number;
  due_date: string | null;
  status: string;
  /** Which project and schedule it came from, for the caption. */
  scheduleTitle?: string;
  projectName?: string;
}

export interface ClientBalance {
  totalCents: number;
  paidCents: number;
  dueCents: number;
  /** 0–100 of the total that is paid. Nothing invoiced is 0. */
  pct: number;
  /** The invoice the card is about: the earliest unpaid one. */
  next: BalanceInvoice | null;
  /** The pill: where that next invoice has got to. */
  nextLabel: string;
  /** True when there is nothing to show at all. */
  empty: boolean;
}

export const NO_BALANCE: ClientBalance = {
  totalCents: 0, paidCents: 0, dueCents: 0, pct: 0,
  next: null, nextLabel: "Nothing invoiced", empty: true,
};

const PAID = new Set(["paid"]);
// Cancelled money is not money. A voided invoice left in the total has the
// client owing a balance nobody will ever send them.
const VOID = new Set(["void", "voided", "cancelled", "canceled"]);

/** The words on the pill for an invoice that has not been paid. */
function labelFor(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "draft" || s === "pending" || s === "scheduled") return "Not sent yet";
  if (s === "sent" || s === "open") return "Sent, unpaid";
  if (s === "overdue" || s === "past_due") return "Overdue";
  // An unfamiliar status is printed rather than guessed at — this comes
  // from an edge function over a table this app does not own.
  return status.trim() || "Unpaid";
}

/**
 * Sorted earliest-due first, with undated invoices last: an invoice with
 * no due date is not urgent, and sorting it to the front would make every
 * client's card about the same unscheduled final payment.
 */
function byDueDate(a: BalanceInvoice, b: BalanceInvoice): number {
  if (!a.due_date && !b.due_date) return 0;
  if (!a.due_date) return 1;
  if (!b.due_date) return -1;
  return a.due_date.localeCompare(b.due_date);
}

export function summarise(invoices: BalanceInvoice[]): ClientBalance {
  const live = invoices.filter((i) => !VOID.has(i.status.trim().toLowerCase()));
  if (!live.length) return NO_BALANCE;

  const totalCents = live.reduce((s, i) => s + i.amount_cents, 0);
  const paidCents = live
    .filter((i) => PAID.has(i.status.trim().toLowerCase()))
    .reduce((s, i) => s + i.amount_cents, 0);
  const unpaid = live.filter((i) => !PAID.has(i.status.trim().toLowerCase()));
  const next = [...unpaid].sort(byDueDate)[0] ?? null;

  return {
    totalCents,
    paidCents,
    dueCents: totalCents - paidCents,
    pct: totalCents === 0 ? 0 : Math.floor((paidCents / totalCents) * 100),
    next,
    nextLabel: next ? labelFor(next.status) : "Paid in full",
    empty: false,
  };
}

export function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    // Whole dollars when it is whole dollars: "$2,500" reads as a figure,
    // "$2,500.00" reads as a line on a statement.
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
