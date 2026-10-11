// What the Money page says, worked out from project_invoices.
//
// Pure, and every function in here is a number shown to the person who
// runs the business. "Collected in 2026" being wrong is not a layout bug.
// The specific traps: a voided invoice is not money, a scheduled one is
// not owed, and a month with nothing collected has to appear in the chart
// as a zero rather than vanish — a bar chart that silently drops empty
// months turns a quiet summer into a straight line up and to the right.

export interface MoneyInvoice {
  id: string;
  client_id: string;
  client_project_id: string;
  label: string;
  amount_cents: number;
  status: string;
  due_date: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
  voided_at?: string | null;
  trigger?: string | null;
  due_days?: number | null;
}

/** Cancelled money is not money, however it was spelled. */
export function isVoid(i: MoneyInvoice): boolean {
  const s = (i.status ?? "").trim().toLowerCase();
  return s === "void" || s === "voided" || s === "cancelled" || s === "canceled" || !!i.voided_at;
}
export function isPaid(i: MoneyInvoice): boolean {
  return !isVoid(i) && ((i.status ?? "").trim().toLowerCase() === "paid" || !!i.paid_at);
}
/** Out with the client and not yet paid. */
export function isChase(i: MoneyInvoice): boolean {
  return !isVoid(i) && !isPaid(i) && (i.status ?? "").trim().toLowerCase() === "sent";
}
/** Agreed but not sent — money that is not owed yet. */
export function isScheduled(i: MoneyInvoice): boolean {
  const s = (i.status ?? "").trim().toLowerCase();
  return !isVoid(i) && !isPaid(i) && (s === "scheduled" || s === "draft");
}

export interface MoneyBuckets {
  chase: MoneyInvoice[];
  billsNext: MoneyInvoice[];
  paid: MoneyInvoice[];
  voided: MoneyInvoice[];
  collectedCents: number;
  owedCents: number;
  notBilledCents: number;
}

/**
 * @param year Which year "collected" covers. Everything else is all-time:
 *   an invoice sent in December and unpaid in January is still owed.
 */
export function bucketInvoices(invoices: MoneyInvoice[], year = new Date().getFullYear()): MoneyBuckets {
  const chase: MoneyInvoice[] = [], billsNext: MoneyInvoice[] = [];
  const paid: MoneyInvoice[] = [], voided: MoneyInvoice[] = [];
  for (const i of invoices) {
    if (isVoid(i)) voided.push(i);
    else if (isPaid(i)) paid.push(i);
    else if (isChase(i)) chase.push(i);
    else if (isScheduled(i)) billsNext.push(i);
  }
  // Oldest first: the thing you have been waiting longest for is the
  // thing to chase.
  chase.sort((a, b) => (a.sent_at ?? "").localeCompare(b.sent_at ?? ""));
  paid.sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? ""));

  return {
    chase, billsNext, paid, voided,
    collectedCents: paid
      .filter((i) => inYear(i.paid_at, year))
      .reduce((s, i) => s + i.amount_cents, 0),
    owedCents: chase.reduce((s, i) => s + i.amount_cents, 0),
    notBilledCents: billsNext.reduce((s, i) => s + i.amount_cents, 0),
  };
}

function inYear(iso: string | null | undefined, year: number): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getFullYear() === year;
}

/** How long an invoice has been out and unpaid. Null once it is paid. */
export function daysUnpaid(i: MoneyInvoice, now = new Date()): number | null {
  if (!isChase(i) || !i.sent_at) return null;
  const sent = new Date(i.sent_at);
  if (Number.isNaN(sent.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - sent.getTime()) / 86_400_000));
}

/** Past its due date, not merely old. */
export function isOverdue(i: MoneyInvoice, now = new Date()): boolean {
  if (!isChase(i) || !i.due_date) return false;
  return new Date(`${i.due_date}T23:59:59`) < now;
}

export interface MonthBar { key: string; label: string; cents: number }

/**
 * The last `months` months, ending with the current one.
 *
 * Empty months are kept. A chart that drops them is not a smaller chart,
 * it is a different and flattering one — three payments in May, July and
 * October become "three months of steady growth".
 */
export function collectedByMonth(invoices: MoneyInvoice[], months = 6, now = new Date()): MonthBar[] {
  const out: MonthBar[] = [];
  for (let back = months - 1; back >= 0; back--) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString(undefined, { month: "short" }),
      cents: 0,
    });
  }
  const index = new Map(out.map((m, i) => [m.key, i]));
  for (const i of invoices) {
    if (!isPaid(i) || !i.paid_at) continue;
    const d = new Date(i.paid_at);
    if (Number.isNaN(d.getTime())) continue;
    const slot = index.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    if (slot != null) out[slot].cents += i.amount_cents;
  }
  return out;
}

export interface ClientMoney {
  clientId: string;
  paidCents: number;
  owedCents: number;
  toBillCents: number;
  /** Everything that is not voided — what this client is worth. */
  totalCents: number;
}

/** Per client, biggest first. Clients with nothing still appear, at zero. */
export function byClient(invoices: MoneyInvoice[], clientIds: string[]): ClientMoney[] {
  const map = new Map<string, ClientMoney>();
  for (const id of clientIds) {
    map.set(id, { clientId: id, paidCents: 0, owedCents: 0, toBillCents: 0, totalCents: 0 });
  }
  for (const i of invoices) {
    if (isVoid(i)) continue;
    const row = map.get(i.client_id)
      ?? { clientId: i.client_id, paidCents: 0, owedCents: 0, toBillCents: 0, totalCents: 0 };
    if (isPaid(i)) row.paidCents += i.amount_cents;
    else if (isChase(i)) row.owedCents += i.amount_cents;
    else if (isScheduled(i)) row.toBillCents += i.amount_cents;
    row.totalCents += i.amount_cents;
    map.set(i.client_id, row);
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents);
}

/** "Bills when the work is complete · due 14 days after sending". */
export function billsWhen(i: MoneyInvoice): string {
  const t = (i.trigger ?? "").trim().toLowerCase();
  const when = t === "on_signature" ? "Bills when the client signs"
    : t === "on_completion" ? "Bills when the work is complete"
      : i.due_date ? `Bills on ${i.due_date}`
        : "No trigger set";
  return i.due_days ? `${when} · due ${i.due_days} days after sending` : when;
}
