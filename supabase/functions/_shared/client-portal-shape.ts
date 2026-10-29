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
  type PortalProject,
  type SharedLogin,
  type WaitingItem,
} from "./client-portal-wire.ts";

/* -------------------------------------------------------------------------- */
/* The project card (mockup 13, Bree's decision of 28 Oct)                     */
/* -------------------------------------------------------------------------- */

/**
 * What kind of work a project is, in a client's words.
 *
 * Two vocabularies in one map, which is worth defending rather than hiding:
 * the `/admin` bridge stores `client_projects.type`, and the plugin reads a
 * Paperclip project that has no type at all. Both sources call the same
 * function so that one spelling cannot mean "Website" on the bridge and
 * something else after CP-6 moves the data -- the one visible symptom of a
 * migration is the words on the client's screen changing, and that is the one
 * thing nobody is watching for.
 *
 * Anything unrecognised is null rather than the key itself. A licensee's own
 * project type is not a word we are entitled to invent, and `site_preview`
 * printed on a client's home screen is the mistake CRE-797 already cost us
 * once: right in the database, meaningless to the reader.
 */
export function projectKindLabel(type: string | null | undefined): string | null {
  const known: Record<string, string> = {
    site_preview: "Website",
    web_development: "Website",
    app_development: "App",
    automation_build: "Automation",
    marketing: "Marketing",
  };
  return known[(type ?? "").trim().toLowerCase()] ?? null;
}

/**
 * What a project's state is called on a client's screen.
 *
 * Both vocabularies again -- `active | paused | complete` from the `/admin`
 * tables, and `backlog | planned | in_progress | completed | cancelled` from
 * a Paperclip project -- mapped onto the words a client would use. The two
 * spellings of done deliberately land on the same label.
 *
 * `archived` is absent on purpose: both sources filter those rows out before
 * they reach here, and giving it a label would make it look as though
 * somewhere draws one.
 */
export function projectStatusLabel(status: string | null | undefined): string | null {
  const known: Record<string, string> = {
    active: "In progress",
    in_progress: "In progress",
    paused: "On hold",
    complete: "Complete",
    completed: "Complete",
    backlog: "Not started yet",
    planned: "Starting soon",
    cancelled: "Stopped",
  };
  return known[(status ?? "").trim().toLowerCase()] ?? null;
}

/**
 * Plugin link rows as the home screen's project list.
 *
 * TWO THINGS ARE DROPPED RATHER THAN GUESSED AT.
 *
 * A row whose `project` the plugin could not resolve is left out. The name is
 * the only part of a project row a client can read -- `kind`, `statusLabel`
 * and the link are all optional -- so a row without one is a bullet point
 * saying nothing, and "Untitled project" on somebody's portal reads as data
 * we have lost. Leaving it out is visible in a way that is honest: the card
 * shows the projects we can name, or no card at all.
 *
 * The link is drawn only for a project CP-6 imported, because
 * `/portal/:clientId/projects/:projectId` is an `/admin` page addressed by an
 * `/admin` id. `paperclipProjectId` is not that id and would 404. When the
 * project page itself moves -- CRE-784 -- this is the line that changes, and
 * `legacyAdminProjectId` stops being load-bearing at the same moment the
 * bridge does.
 */
export function pluginProjects(
  projects: Array<{
    id: string;
    legacyAdminProjectId?: string | null;
    /** The link row's own kind (CRE-822) -- see `projectKindLabel` below. */
    kind?: string | null;
    project?: { name?: string | null; status?: string | null } | null;
  }>,
  clientId: string,
): PortalProject[] {
  return projects.flatMap((row): PortalProject[] => {
    const name = (row.project?.name ?? "").trim();
    if (name.length === 0) return [];
    const adminId = row.legacyAdminProjectId ?? null;
    return [
      {
        id: row.id,
        name,
        kind: projectKindLabel(row.kind ?? null),
        statusLabel: projectStatusLabel(row.project?.status ?? null),
        href: adminId
          ? `/portal/${encodeURIComponent(clientId)}/projects/${encodeURIComponent(adminId)}`
          : null,
        // The link row's own `updatedAt` is when somebody edited what the
        // client is shown, which is not when the project moved. Saying
        // nothing beats dating a project by a visibility edit.
        updatedAt: null,
      },
    ];
  });
}

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



/**
 * Placed logins first, by their own order; everything unplaced after, oldest
 * first (CRE-822).
 *
 * `sortOrder` is null for a row nobody has placed, and null never folds into
 * `0` -- `0` is a real position. A placed row is a deliberate choice about
 * where it sits, so it outranks every row nobody has touched rather than
 * interleaving with them by date.
 */
export function sortLogins<T extends Pick<SharedLogin, "sortOrder" | "sharedAt">>(
  logins: T[],
): T[] {
  return [...logins].sort((a, b) => {
    const aOrder = a.sortOrder ?? null;
    const bOrder = b.sortOrder ?? null;
    if (aOrder !== null && bOrder !== null) return aOrder - bOrder;
    if (aOrder !== null) return -1;
    if (bOrder !== null) return 1;
    return a.sharedAt.localeCompare(b.sharedAt);
  });
}

export const __testing = { compareRows };
