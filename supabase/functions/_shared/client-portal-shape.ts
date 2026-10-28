// Turning plugin rows into the rows mockups 13-16 draw.
//
// Pure, and in `_shared/` rather than next to the source that uses it, for
// the reason the house notes give: a module that reaches `Deno` or an `npm:`
// specifier cannot be imported by the frontend test suite at all, and a copy
// of this logic pasted into a test is a test that cannot fail when the real
// code changes. `plugin-source.ts` holds the credential and the HTTP; this
// holds the decisions, and `src/test/client-portal-source.test.ts` drives it
// directly.
//
// Nothing here performs IO, reads an environment variable, or knows what a
// request is.

import {
  paymentState,
  type AgreementView,
  type PaymentRow,
  type WaitingItem,
} from "./client-portal-wire.ts";

/** The slice of a plugin invoice these functions read. */
export interface ShapeInvoice {
  id: string;
  paymentScheduleId: string | null;
  number?: string | null;
  amountCents: number;
  currency: string;
  status: string;
  provider: string | null;
  checkoutUrl: string | null;
  receiptUrl: string | null;
  issuedAt: string | null;
  dueOn: string | null;
  paidAt: string | null;
}

/** The slice of a plugin payment-schedule item these functions read. */
export interface ShapeScheduleItem {
  id: string;
  sequence: number;
  label: string;
  amountCents: number;
  currency: string;
  dueRule: string;
  dueOn: string | null;
  dueMilestone: string | null;
  status: string;
}

/**
 * Invoices and unbilled schedule items, as one list of payment rows.
 *
 * Mockup 15 draws both: "Deposit" and "Design approved" are invoices, and
 * "Launch · Before launch · Later" is a schedule item nobody has billed. A
 * screen showing only invoices would show a client two payments on a
 * three-payment contract, which reads as a cheaper contract.
 */
export function invoiceRows(
  invoices: ShapeInvoice[],
  schedule: ShapeScheduleItem[],
  now: Date,
): PaymentRow[] {
  const billed = new Set(
    invoices.map((invoice) => invoice.paymentScheduleId).filter(Boolean) as string[],
  );
  // The words a client reads on each row come from the schedule the licensee
  // wrote -- "Deposit", "Design approved" -- and not from an invoice number.
  const scheduleLabels = new Map(schedule.map((item) => [item.id, item.label]));

  const fromInvoices = invoices.map((invoice): PaymentRow => {
    const state = paymentState({
      paidAt: invoice.paidAt,
      // An invoice row exists because somebody billed it. `issuedAt` is when
      // it was sent; a row with neither is still a bill that has been raised.
      issued: invoice.status !== "void",
      dueOn: invoice.dueOn,
      now,
    });
    return {
      id: invoice.id,
      // An invoice has a number, not a label; the label is on the schedule
      // item it came from. Joined below where both are available, and the
      // number is the honest fallback when they are not.
      label: scheduleLabels.get(invoice.paymentScheduleId ?? "") ?? invoice.number ?? "Payment",
      dueOn: invoice.dueOn,
      dueNote: null,
      amountCents: invoice.amountCents,
      currency: invoice.currency.toUpperCase(),
      state,
      paidWith: invoice.paidAt ? providerLabel(invoice.provider) : null,
      paidAt: invoice.paidAt,
      receiptUrl: invoice.paidAt ? invoice.receiptUrl : null,
      payable: state === "ready" || state === "overdue",
    };
  });

  const fromSchedule = schedule
    .filter((item) => !billed.has(item.id) && item.status !== "void")
    .map((item): PaymentRow => ({
      id: `schedule:${item.id}`,
      label: item.label,
      dueOn: item.dueRule === "date" ? item.dueOn : null,
      // "Before launch" -- a rule rather than a date, shown as written.
      dueNote: item.dueRule === "milestone" ? item.dueMilestone : null,
      amountCents: item.amountCents,
      currency: item.currency.toUpperCase(),
      state: "later",
      paidWith: null,
      paidAt: null,
      receiptUrl: null,
      payable: false,
    }));

  return [...fromInvoices, ...fromSchedule].sort(compareRows);
}

/** Schedule order: by date, then undated, then paid at the top of their date. */
function compareRows(a: PaymentRow, b: PaymentRow): number {
  if (a.dueOn && b.dueOn) return a.dueOn.localeCompare(b.dueOn);
  if (a.dueOn) return -1;
  if (b.dueOn) return 1;
  return 0;
}

/** At most one violet button in a list, and it is the first row. */
export function markFirstPrimary(items: WaitingItem[]): WaitingItem[] {
  let seen = false;
  return items.map((item) => {
    const primary = !seen && item.href !== null;
    if (primary) seen = true;
    return { ...item, primary };
  });
}

/**
 * A provider key as a client would recognise it.
 *
 * A key the licensee invented falls through to itself rather than to a
 * default, because a button saying "Pay with Stripe" for a payment going to
 * somebody else is worse than one saying "Pay with acme-pay".
 */
export function providerLabel(key: string | null): string | null {
  if (!key || key === "manual" || key === "builtin") return null;
  const known: Record<string, string> = {
    paypal: "PayPal",
    stripe: "Stripe",
    surecart: "SureCart",
  };
  return known[key] ?? key;
}

/** The line under the payments table. Names a provider only when there is one. */
export function footnoteFor(providers: string[]): string {
  const unique = [...new Set(providers)].filter(Boolean);
  if (unique.length === 1) {
    return `Payments go straight to ${unique[0]}. We never see or store your card.`;
  }
  return "Payments are taken by our payment provider. We never see or store your card.";
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * The plugin's proposal status, narrowed to the set the screen draws.
 *
 * Anything unrecognised becomes `sent`, because the v1 promise is that enums
 * gain members: a status this build has never heard of is a document the
 * client has been given, and showing it beats hiding it.
 */
export function widenStatus(status: string): AgreementView["status"] {
  const known: AgreementView["status"][] = [
    "draft",
    "sent",
    "viewed",
    "signed",
    "declined",
    "expired",
    "void",
  ];
  return known.includes(status as AgreementView["status"])
    ? (status as AgreementView["status"])
    : "sent";
}



export const __testing = { compareRows };
