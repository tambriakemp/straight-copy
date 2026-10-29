/**
 * The shaping the client portal's two data sources do (CRE-776).
 *
 * The composition for mockups 13-16 happens on the server, which is what
 * keeps the plugin's API key out of the browser -- and means a reader of the
 * screens cannot see the decisions. These are the ones worth pinning:
 *
 * **The payments table shows the whole schedule, not just the bills.** A
 * client looking at a three-payment contract and seeing two rows reads it as
 * a cheaper contract. Covered from both sources, because they derive it
 * differently: the plugin joins invoices to schedule items, and the `/admin`
 * tables carry both states on one row.
 *
 * **A scheduled instalment is never "Ready to pay".** A date is a plan and
 * billing is the event. Getting this wrong sends a client to a payment page
 * for an amount the agency has no record of asking for.
 *
 * **A provider key a licensee invented falls through to itself.** A button
 * saying "Pay with Stripe" for money going somewhere else is worse than one
 * saying "Pay with acme-pay".
 *
 * These import from `supabase/functions/`, which `tsconfig.app.json` does not
 * include -- the same arrangement `agent-history.test.ts` and
 * `proposal-defaults.test.ts` already use.
 *
 * Both modules are deliberately free of `Deno` and of `npm:` specifiers.
 * `client-portal-shape.ts` exists for exactly that reason: the shaping used
 * to live in `plugin-source.ts`, which holds the plugin credential and
 * reaches `Deno.env`, and importing that from a test pulled `Deno` into the
 * app's own typecheck.
 */

import { describe, expect, it } from "vitest";
import {
  footnoteFor,
  invoiceRows,
  pluginProjects,
  projectKindLabel,
  projectStatusLabel,
  providerLabel,
} from "../../supabase/functions/_shared/client-portal-shape";
import { payWaitingItem } from "../lib/clientPortalWire";
import { money } from "../lib/clientPortalApi";
import {
  adminProjects,
  adminStatus,
  applicableAccountAccessItems,
  accountAccessComplete,
  loginRevealAudit,
  headlineFor,
  invoiceRowsFromAdmin,
  isNodeDone,
  lineItemsFrom,
  recentUpdates,
  sanitiseAccountAccessChecks,
} from "../../supabase/functions/client-portal/legacy-source";
import type { AccountAccessItem } from "../../supabase/functions/_shared/client-portal-wire";

const NOW = new Date("2026-10-28T12:00:00.000Z");

/* -------------------------------------------------------------------------- */
/* The plugin source                                                           */
/* -------------------------------------------------------------------------- */

function pluginInvoice(over: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    paymentScheduleId: "sched-1",
    number: "INV-1",
    amountCents: 120_000,
    currency: "usd",
    status: "paid",
    provider: "paypal",
    checkoutUrl: null,
    receiptUrl: null,
    issuedAt: "2026-10-01T00:00:00Z",
    dueOn: "2026-10-03",
    paidAt: "2026-10-03T09:00:00Z",
    ...over,
  } as Parameters<typeof invoiceRows>[0][number];
}

function scheduleItem(over: Record<string, unknown> = {}) {
  return {
    id: "sched-1",
    sequence: 1,
    label: "Deposit",
    amountCents: 120_000,
    currency: "usd",
    dueRule: "date",
    dueOn: "2026-10-03",
    dueMilestone: null,
    status: "due",
    ...over,
  } as Parameters<typeof invoiceRows>[1][number];
}

describe("the payments table, from the plugin", () => {
  it("reads mockup 15 back: two bills and one instalment nobody has raised", () => {
    const rows = invoiceRows(
      [
        pluginInvoice({ id: "a", paymentScheduleId: "s1", paidAt: "2026-10-03T09:00:00Z" }),
        pluginInvoice({
          id: "b",
          paymentScheduleId: "s2",
          status: "sent",
          paidAt: null,
          amountCents: 240_000,
          dueOn: "2026-11-14",
          checkoutUrl: "https://paypal.test/c/2",
        }),
      ],
      [
        scheduleItem({ id: "s1", label: "Deposit" }),
        scheduleItem({ id: "s2", label: "Design approved", dueOn: "2026-11-14" }),
        scheduleItem({
          id: "s3",
          label: "Launch",
          amountCents: 120_000,
          dueRule: "milestone",
          dueOn: null,
          dueMilestone: "Before launch",
        }),
      ],
      NOW,
    );

    expect(rows.map((row) => [row.label, row.state, row.payable])).toEqual([
      ["Deposit", "paid", false],
      ["Design approved", "ready", true],
      // The row nobody has billed. Shown, with no button and its own wording.
      ["Launch", "later", false],
    ]);
    expect(rows[2].dueNote).toBe("Before launch");
    expect(rows[2].dueOn).toBeNull();
  });

  it("says which project each payment is for, invoice or instalment (CRE-831)", () => {
    const rows = invoiceRows(
      [pluginInvoice({ id: "a", paymentScheduleId: "s1", clientProjectId: "p-site" })],
      [
        scheduleItem({ id: "s1", label: "Deposit", clientProjectId: "p-site" }),
        scheduleItem({
          id: "s2",
          label: "Launch",
          dueOn: "2026-11-14",
          clientProjectId: "p-auto",
        }),
      ],
      NOW,
      new Map([
        ["p-site", "Glowskin website"],
        ["p-auto", "Booking automation"],
      ]),
    );
    expect(rows.map((row) => [row.label, row.projectName])).toEqual([
      ["Deposit", "Glowskin website"],
      ["Launch", "Booking automation"],
    ]);
  });

  it("takes an invoice's project from the instalment it bills when it has none of its own", () => {
    // The plugin fills the invoice column from migration 015 onwards; a row
    // written before it has the project on the plan and not on the bill.
    const [row] = invoiceRows(
      [pluginInvoice({ paymentScheduleId: "s1" })],
      [scheduleItem({ id: "s1", clientProjectId: "p-site" })],
      NOW,
      new Map([["p-site", "Glowskin website"]]),
    );
    expect(row.projectId).toBe("p-site");
    expect(row.projectName).toBe("Glowskin website");
  });

  it("says nothing rather than borrowing a name for a project this client does not own", () => {
    // The lookup is built from this client's own projects, so an id that is
    // not in it is unfiled -- not an id drawn with somebody else's name, and
    // not a group headed by a uuid.
    const [row] = invoiceRows(
      [pluginInvoice({ clientProjectId: "p-somebody-else" })],
      [],
      NOW,
      new Map([["p-site", "Glowskin website"]]),
    );
    expect(row.projectId).toBeNull();
    expect(row.projectName).toBeNull();
  });

  it("labels a row from the schedule, not from the invoice number", () => {
    // The words a client reads are the licensee's. "INV-1" is ours.
    const [row] = invoiceRows([pluginInvoice()], [scheduleItem({ label: "Deposit" })], NOW);
    expect(row.label).toBe("Deposit");
  });

  it("falls back to the invoice number when nothing links it to a schedule", () => {
    const [row] = invoiceRows([pluginInvoice({ paymentScheduleId: null })], [], NOW);
    expect(row.label).toBe("INV-1");
  });

  it("does not list a schedule item twice once it has been billed", () => {
    const rows = invoiceRows([pluginInvoice()], [scheduleItem()], NOW);
    expect(rows).toHaveLength(1);
  });

  it("carries the provider receipt through, and only on a paid row", () => {
    const [paid] = invoiceRows(
      [pluginInvoice({ receiptUrl: "https://paypal.test/r/1" })],
      [],
      NOW,
    );
    expect(paid.receiptUrl).toBe("https://paypal.test/r/1");

    const [unpaid] = invoiceRows(
      [pluginInvoice({ paidAt: null, status: "sent", receiptUrl: "https://paypal.test/r/1" })],
      [],
      NOW,
    );
    expect(unpaid.receiptUrl).toBeNull();
  });

  it("marks a bill whose date has gone as overdue, not merely ready", () => {
    const [row] = invoiceRows(
      [pluginInvoice({ paidAt: null, status: "sent", dueOn: "2026-10-01" })],
      [],
      NOW,
    );
    expect(row.state).toBe("overdue");
    expect(row.payable).toBe(true);
  });
});

describe("naming the payment provider", () => {
  it("knows the common ones", () => {
    expect(providerLabel("paypal")).toBe("PayPal");
    expect(providerLabel("stripe")).toBe("Stripe");
  });

  it("passes a licensee's own key through rather than guessing", () => {
    // "Pay with Stripe" for money going to somebody else is worse than
    // "Pay with acme-pay".
    expect(providerLabel("acme-pay")).toBe("acme-pay");
  });

  it("names nothing for a payment taken by hand", () => {
    expect(providerLabel("manual")).toBeNull();
    expect(providerLabel("builtin")).toBeNull();
    expect(providerLabel(null)).toBeNull();
  });
});

describe("the line under the payments table", () => {
  it("names the provider when there is exactly one", () => {
    expect(footnoteFor(["PayPal"])).toBe(
      "Payments go straight to PayPal. We never see or store your card.",
    );
  });

  it("says something true when there are several, or none", () => {
    expect(footnoteFor(["PayPal", "Stripe"])).toContain("our payment provider");
    expect(footnoteFor([])).toContain("our payment provider");
  });

  it("treats one provider named twice as one provider", () => {
    expect(footnoteFor(["PayPal", "PayPal"])).toContain("PayPal");
  });
});

/* -------------------------------------------------------------------------- */
/* The /admin tables                                                           */
/* -------------------------------------------------------------------------- */

describe("the payments table, from the /admin tables", () => {
  it("separates a raised bill from a scheduled one", () => {
    const rows = invoiceRowsFromAdmin(
      [
        {
          id: "a",
          label: "Deposit",
          amount_cents: 120_000,
          currency: "usd",
          status: "paid",
          due_date: "2026-10-03",
          paid_at: "2026-10-03T09:00:00Z",
          checkout_url: "https://sc.test/1",
        },
        {
          id: "b",
          label: "Design approved",
          amount_cents: 240_000,
          currency: "usd",
          status: "sent",
          due_date: "2026-11-14",
          paid_at: null,
          checkout_url: "https://sc.test/2",
        },
        {
          id: "c",
          label: "Launch",
          amount_cents: 120_000,
          currency: "usd",
          status: "scheduled",
          due_date: null,
          paid_at: null,
          checkout_url: null,
        },
      ],
      NOW,
    );
    expect(rows.map((row) => [row.label, row.state, row.payable])).toEqual([
      ["Deposit", "paid", false],
      ["Design approved", "ready", true],
      ["Launch", "later", false],
    ]);
  });

  it("names the project each payment is for, and only this client's (CRE-831)", () => {
    const rows = invoiceRowsFromAdmin(
      [
        {
          id: "a",
          label: "Deposit",
          amount_cents: 120_000,
          currency: "usd",
          status: "sent",
          due_date: "2026-10-03",
          paid_at: null,
          checkout_url: "https://sc.test/1",
          client_project_id: "p-site",
        },
        {
          id: "b",
          label: "Retainer",
          amount_cents: 60_000,
          currency: "usd",
          status: "sent",
          due_date: "2026-11-03",
          paid_at: null,
          checkout_url: "https://sc.test/2",
          client_project_id: "p-not-theirs",
        },
      ],
      NOW,
      new Map([["p-site", "Glowskin website"]]),
    );
    expect(rows.map((row) => [row.label, row.projectId, row.projectName])).toEqual([
      ["Deposit", "p-site", "Glowskin website"],
      // The query that builds the lookup is scoped to this client, so an id
      // outside it is unfiled rather than drawn with a borrowed name.
      ["Retainer", null, null],
    ]);
  });

  it("will not offer to take money with no checkout to send them to", () => {
    const [row] = invoiceRowsFromAdmin(
      [
        {
          id: "a",
          label: "Deposit",
          amount_cents: 1000,
          currency: "usd",
          status: "sent",
          due_date: null,
          paid_at: null,
          checkout_url: null,
        },
      ],
      NOW,
    );
    // Billed, so the client is told it is ready -- and the button is absent,
    // because pressing it could only fail.
    expect(row.state).toBe("ready");
    expect(row.payable).toBe(false);
  });

  it("reads an amount that is not a number as zero rather than NaN", () => {
    const [row] = invoiceRowsFromAdmin(
      [
        {
          id: "a",
          label: "Deposit",
          amount_cents: null,
          currency: "usd",
          status: "scheduled",
          due_date: null,
          paid_at: null,
          checkout_url: null,
        },
      ],
      NOW,
    );
    expect(row.amountCents).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* The project list, and paying as a task (Bree's decision of 28 Oct)          */
/* -------------------------------------------------------------------------- */

describe("what a project is called on a client's screen", () => {
  it("turns both sources' vocabularies into the same words", () => {
    // The point of one function over two maps: `complete` from the `/admin`
    // tables and `completed` from a Paperclip project are the same state, and
    // a client should not be able to tell which side of CP-6's import their
    // portal is being served from by reading it.
    expect(projectStatusLabel("complete")).toBe("Complete");
    expect(projectStatusLabel("completed")).toBe("Complete");
    expect(projectStatusLabel("active")).toBe("In progress");
    expect(projectStatusLabel("in_progress")).toBe("In progress");
    expect(projectKindLabel("site_preview")).toBe("Website");
    expect(projectKindLabel("web_development")).toBe("Website");
  });

  it("says nothing rather than printing a key it does not know", () => {
    // `site_preview` on a client's home screen is the mistake CRE-797 cost
    // us once: right in the database, meaningless to the reader. A licensee's
    // own project type is not a word we are entitled to invent for them.
    expect(projectKindLabel("brand_sprint")).toBeNull();
    expect(projectStatusLabel("awaiting_legal")).toBeNull();
    expect(projectKindLabel(null)).toBeNull();
    expect(projectStatusLabel(undefined)).toBeNull();
    // Both sources filter these out; a label would imply somewhere draws one.
    expect(projectStatusLabel("archived")).toBeNull();
  });
});

describe("the project list, from the /admin tables", () => {
  const PROJECTS = [
    { id: "p-1", name: "Glowskin website", type: "site_preview", status: "active", updated_at: "2026-10-27T09:00:00.000Z" },
    { id: "p-2", name: "Booking reminders", type: "automation_build", status: "paused", updated_at: null },
  ];

  it("drops a nameless row, the same as the plugin path does", () => {
    // `client_projects.name` is NOT NULL and the empty string satisfies
    // that, so this is reachable. The two sources answering differently for
    // the same shape of bad row is how a client's portal would change under
    // them at CP-6's import -- a row that reads as blank on one and is
    // absent on the other.
    expect(adminProjects([{ id: "p-1", name: "  ", type: null, status: "active" }], "c")).toEqual(
      [],
    );
  });

  it("names every project and links every one of them", () => {
    // On this source the project id IS the `/admin` project id, which is what
    // `/portal/:clientId/project/:projectId` resolves -- the redesigned
    // project screen. The older `/projects/:projectId` page is not where
    // Home's Open button goes.
    expect(adminProjects(PROJECTS, "client-7")).toEqual([
      {
        id: "p-1",
        name: "Glowskin website",
        kind: "Website",
        statusLabel: "In progress",
        href: "/portal/client-7/project/p-1",
        updatedAt: "2026-10-27T09:00:00.000Z",
      },
      {
        id: "p-2",
        name: "Booking reminders",
        kind: "Automation",
        statusLabel: "On hold",
        href: "/portal/client-7/project/p-2",
        updatedAt: null,
      },
    ]);
  });
});

describe("the project list, from the plugin", () => {
  it("leaves out a project it cannot name", () => {
    // The name is the only part of the row a client can read -- kind, status
    // and the link are all optional -- so a row without one is a bullet point
    // saying nothing. The field is optional on the wire because the plugin
    // resolves it through the host, which is newer than the first release of
    // this screen: an older plugin sends no `project` at all, and the honest
    // answer is a shorter list rather than "Untitled project" on somebody's
    // portal.
    const rows = pluginProjects(
      [
        { id: "cp-1", project: { name: "Glowskin website", status: "in_progress" } },
        { id: "cp-2", project: null },
        { id: "cp-3" },
        { id: "cp-4", project: { name: "   " } },
      ],
      "client-7",
    );
    expect(rows.map((row) => row.id)).toEqual(["cp-1"]);
    expect(rows[0]!.statusLabel).toBe("In progress");
  });

  it("links only a project the redesigned page can address", () => {
    // `/portal/:clientId/project/:projectId` is the redesigned project screen,
    // addressed by the admin project id. `paperclipProjectId` is not that id
    // and would 404, so the link is drawn from `legacyAdminProjectId` -- which
    // CP-6's import writes and which is null for anything created in the plugin.
    const [imported, native] = pluginProjects(
      [
        {
          id: "cp-1",
          legacyAdminProjectId: "admin-99",
          project: { name: "Glowskin website", status: "in_progress" },
        },
        { id: "cp-2", legacyAdminProjectId: null, project: { name: "Spring campaign" } },
      ],
      "client-7",
    );
    expect(imported!.href).toBe("/portal/client-7/project/admin-99");
    expect(native!.href).toBeNull();
    // A project the plugin links to is a project, not a product line, so
    // there is no kind to report on this source.
    expect(native!.kind).toBeNull();
  });
});

describe("a password copy's audit row", () => {
  it("names the login and the person, and has nowhere to put the password", () => {
    const secret = "correct-horse-battery-staple";
    const row = loginRevealAudit({
      clientId: "client-7",
      loginId: "login-1",
      label: "Site host",
      projectId: null,
      userId: "user-1",
      via: "portal",
      actorLabel: null,
    });
    expect(row.kind).toBe("portal_login_revealed");
    expect(row.metadata).toEqual({
      login_id: "login-1",
      via: "portal",
      user_id: "user-1",
    });
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(Object.keys(row.metadata as Record<string, unknown>).sort()).toEqual([
      "login_id",
      "user_id",
      "via",
    ]);
  });
});

describe("paying, as a task waiting on the client", () => {
  const ROW = invoiceRowsFromAdmin(
    [
      {
        id: "inv-9",
        label: "Deposit",
        amount_cents: 208_000,
        currency: "usd",
        status: "sent",
        due_date: "2026-11-14",
        paid_at: null,
        checkout_url: "https://pay.example/1",
      },
    ],
    NOW,
  )[0]!;

  it("carries the amount, because the two cards stack on a phone", () => {
    const item = payWaitingItem(ROW, "client-7", money);
    expect(item).toMatchObject({
      id: "invoice:inv-9",
      title: "Pay Deposit · $2,080",
      icon: "pay",
      action: "Pay",
      href: "/portal/client-7/payments",
    });
  });

  it("says so when the date has passed", () => {
    const overdue = { ...ROW, state: "overdue" as const };
    expect(payWaitingItem(overdue, "client-7", money)!.title).toBe("Pay Deposit · $2,080 — overdue");
  });

  it("is no task at all when nothing is payable", () => {
    // A scheduled instalment is a plan, not a task. Offering one as something
    // waiting on the client sends them to pay an amount nobody has billed.
    expect(payWaitingItem(null, "client-7", money)).toBeNull();
  });
});

describe("whether a journey node is finished", () => {
  it("accepts every spelling two years of writers have used", () => {
    for (const status of ["complete", "completed", "done", "approved", "skipped"]) {
      expect(isNodeDone({ status })).toBe(true);
    }
    expect(isNodeDone({ status: "COMPLETE " })).toBe(true);
  });

  it("believes a completion timestamp over any status", () => {
    expect(isNodeDone({ status: "pending", completed_at: "2026-10-01T00:00:00Z" })).toBe(true);
  });

  it("does not count work that is merely under way", () => {
    expect(isNodeDone({ status: "in_progress" })).toBe(false);
    expect(isNodeDone({})).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* The account-access form (CRE-822, G4)                                       */
/* -------------------------------------------------------------------------- */

function item(over: Partial<AccountAccessItem> = {}): AccountAccessItem {
  return {
    key: "surecontact",
    label: "SureContact",
    description: null,
    helpUrl: null,
    required: true,
    tier: null,
    parentKey: null,
    collectsSecret: false,
    sortOrder: 0,
    ...over,
  };
}

describe("which account-access items apply to a client", () => {
  it("includes every untiered item regardless of the client's tier", () => {
    const items = [item({ key: "a", tier: null })];
    expect(applicableAccountAccessItems(items, "growth")).toHaveLength(1);
    expect(applicableAccountAccessItems(items, null)).toHaveLength(1);
  });

  it("excludes an item naming a tier the client is not on", () => {
    const items = [item({ key: "claude", tier: "growth" })];
    expect(applicableAccountAccessItems(items, "launch")).toHaveLength(0);
    expect(applicableAccountAccessItems(items, null)).toHaveLength(0);
  });

  it("includes a tiered item for a client actually on that tier", () => {
    const items = [item({ key: "claude", tier: "growth" })];
    expect(applicableAccountAccessItems(items, "growth")).toHaveLength(1);
  });
});

describe("whether the account-access form is complete", () => {
  it("is false on an install with no items configured", () => {
    // "Every one of zero required items is done" would mark every client on
    // a fresh install as having finished a form nobody has written yet.
    expect(accountAccessComplete([], {})).toBe(false);
  });

  it("is false while any required item is unticked", () => {
    const items = [item({ key: "a" }), item({ key: "b" })];
    expect(accountAccessComplete(items, { a: true })).toBe(false);
  });

  it("ignores an optional item that was never ticked", () => {
    const items = [item({ key: "a", required: true }), item({ key: "b", required: false })];
    expect(accountAccessComplete(items, { a: true })).toBe(true);
  });

  it("is true once every required item is ticked", () => {
    const items = [item({ key: "a" }), item({ key: "b" })];
    expect(accountAccessComplete(items, { a: true, b: true })).toBe(true);
  });
});

describe("sanitising the account-access checks a client sent", () => {
  const items = [item({ key: "surecontact" }), item({ key: "copost" })];

  it("drops a key that names no item this client was asked for", () => {
    expect(sanitiseAccountAccessChecks({ surecontact: true, made_up: true }, items)).toEqual({
      surecontact: true,
    });
  });

  it("drops a false tick rather than storing it", () => {
    // An absent key and a `false` one mean the same thing; storing both
    // would leave two shapes that have to agree on paper.
    expect(sanitiseAccountAccessChecks({ surecontact: false }, items)).toEqual({});
  });

  it("answers an empty object for anything that is not a plain object", () => {
    expect(sanitiseAccountAccessChecks(null, items)).toEqual({});
    expect(sanitiseAccountAccessChecks("nope", items)).toEqual({});
    expect(sanitiseAccountAccessChecks(undefined, items)).toEqual({});
  });
});

describe("the hero line", () => {
  it("names what is being built", () => {
    expect(headlineFor({ type: "site_preview" })).toBe("Your new site is being built");
    expect(headlineFor({ type: "automation_build" })).toBe("Your automation is being built");
  });

  it("says nothing at all when there is no project", () => {
    // A hero that invents a sentence about somebody's project is worse than
    // a hero with no sentence.
    expect(headlineFor(null)).toBeNull();
    expect(headlineFor({ type: "something_new" })).toBeNull();
  });

  it("uses the project's own name for a kind it does not recognise", () => {
    expect(headlineFor({ type: "something_new", name: "The rebrand" })).toBe(
      "The rebrand is under way",
    );
  });
});

describe("latest from the team", () => {
  it("takes the three most recent things, newest first", () => {
    const updates = recentUpdates(
      [
        { id: "p1", title: "Website proposal", sent_at: "2026-10-01T00:00:00Z", client_signed_at: null },
        { id: "p2", title: "Retainer", sent_at: "2026-10-02T00:00:00Z", client_signed_at: "2026-10-05T00:00:00Z" },
      ],
      [{ id: "i1", label: "Deposit", paid_at: "2026-10-06T00:00:00Z" }],
      [
        { key: "brand", label: "Brand", completed_at: "2026-10-07T00:00:00Z" },
        { key: "kickoff", label: "Kickoff", completed_at: null },
      ],
      );
    expect(updates.map((update) => update.title)).toEqual([
      "Brand is done",
      "Deposit received, thank you",
      "Retainer is signed",
    ]);
    expect(updates.every((update) => update.tone === "positive")).toBe(true);
  });

  it("marks an unsigned proposal as something that needs them", () => {
    const [update] = recentUpdates(
      [{ id: "p1", title: "Website proposal", sent_at: "2026-10-01T00:00:00Z", client_signed_at: null }],
      [],
      [],
    );
    expect(update).toMatchObject({ title: "Website proposal is ready for you", tone: "accent" });
  });

  it("reports nothing when nothing has happened", () => {
    expect(recentUpdates([], [], [])).toEqual([]);
  });
});

describe("a proposal's status, as the client sees it", () => {
  it("believes the signature over the status column", () => {
    // These tables are written by several things; a row carrying a signature
    // timestamp and a stale status is signed.
    expect(adminStatus({ status: "sent", client_signed_at: "2026-10-05T00:00:00Z" })).toBe("signed");
    expect(adminStatus({ status: "sent", declined_at: "2026-10-05T00:00:00Z" })).toBe("declined");
  });

  it("closes a voided or superseded proposal", () => {
    expect(adminStatus({ status: "voided" })).toBe("void");
    expect(adminStatus({ status: "superseded" })).toBe("void");
  });

  it("treats anything else as something to sign", () => {
    expect(adminStatus({ status: "sent" })).toBe("sent");
  });
});

describe("line items out of free-form payment terms", () => {
  it("takes what it recognises, in either spelling", () => {
    expect(
      lineItemsFrom({
        line_items: [
          { description: "Website design & build", amount_cents: 460_000 },
          { label: "Booking integration", amountCents: 60_000 },
        ],
      }),
    ).toEqual([
      { description: "Website design & build", amountCents: 460_000 },
      { description: "Booking integration", amountCents: 60_000 },
    ]);
  });

  it("returns nothing rather than guessing", () => {
    // An investment table with invented rows is a price list the client
    // could hold us to.
    expect(lineItemsFrom(null)).toEqual([]);
    expect(lineItemsFrom({ line_items: "see attached" })).toEqual([]);
    expect(lineItemsFrom({ line_items: [{ amount_cents: 1000 }] })).toEqual([]);
  });
});
