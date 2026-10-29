/**
 * The Payments tab: project per row, grouped by project, filterable
 * (CRE-831, from Bree's portal test of 29 October).
 *
 * The grouping itself is pinned on the pure helper in
 * `client-portal-wire.test.ts`, and what each source puts on a row is pinned
 * in `client-portal-source.test.ts`. What is left is only in the component,
 * and it is the decision that is easy to get wrong in the direction nobody
 * notices: **one project draws neither a heading nor a filter.**
 *
 * A filter with one option is a control that does nothing, and a heading over
 * the whole table is a label rather than a grouping. Most clients have one
 * project, so the single-group case is the common one — and the one a test
 * written only against a two-project fixture would never see.
 *
 * The other thing here is the Pay button. It is the third half of the card:
 * Bree could not pay an unpaid row. The button is drawn from `payable` and
 * goes to the server for a URL, so what a test can hold down is that an
 * unpaid, payable row has one and a paid row does not.
 *
 * Rendered rather than asserted on props: all three branches live in JSX.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import type { PaymentRow, PaymentsView } from "@/lib/clientPortalWire";

const view = vi.hoisted(() => ({ current: null as PaymentsView | null }));

vi.mock("@/components/portal/useClientPortal", () => ({
  useAdminPreview: () => ({
    adminPreview: false,
    viewAsGrant: null,
    actor: null,
    exitPreview: () => {},
  }),
  usePortalView: () => ({
    data: view.current,
    loading: false,
    error: null,
    reload: () => {},
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useParams: () => ({ clientId: "client-7" }) };
});

const { default: ClientPayments } = await import("@/pages/portal/ClientPayments");

function row(over: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: "pay-1",
    label: "Deposit",
    dueOn: "2026-10-03",
    dueNote: null,
    amountCents: 208_000,
    currency: "USD",
    state: "paid",
    paidWith: "PayPal",
    paidAt: "2026-10-03T09:00:00.000Z",
    receiptUrl: null,
    payable: false,
    projectId: "p-site",
    projectName: "Glowskin Studio website",
    ...over,
  };
}

function payments(rows: PaymentRow[]): PaymentsView {
  return {
    branding: {
      agencyName: "Northhill Studio",
      monogram: "NS",
      contactName: null,
      replyWindow: null,
      contactEmail: null,
    },
    me: { clientId: "client-7", displayName: "Maya", businessName: null, initials: "M" },
    totalCents: rows.reduce((sum, item) => sum + item.amountCents, 0),
    paidCents: 0,
    currency: "USD",
    next: null,
    rows,
    footnote: "Payments are taken by our payment provider.",
  };
}

function draw(rows: PaymentRow[]) {
  view.current = payments(rows);
  return render(
    <MemoryRouter>
      <ClientPayments />
    </MemoryRouter>,
  );
}

const TWO_PROJECTS = [
  row({ id: "a", label: "Deposit" }),
  row({
    id: "b",
    label: "Retainer",
    projectId: "p-auto",
    projectName: "Booking automation",
    state: "ready",
    payable: true,
    paidWith: null,
    paidAt: null,
  }),
];

describe("which project a payment is for", () => {
  it("names it on every row", () => {
    draw(TWO_PROJECTS);
    // On the row and not only in a heading: the rows become cards on a phone,
    // where a heading two cards up is not on the screen being read.
    const cells = screen.getAllByText("Glowskin Studio website");
    expect(cells.length).toBeGreaterThan(0);
    expect(screen.getAllByText("Booking automation").length).toBeGreaterThan(0);
  });

  it("draws an em dash for a payment filed under no project", () => {
    draw([row({ projectId: null, projectName: null })]);
    const cell = screen.getByText("Deposit").closest("tr");
    expect(within(cell!).getByText("—")).toBeInTheDocument();
  });
});

describe("grouping and the filter", () => {
  it("draws neither for a client with one project", () => {
    draw([row({ id: "a" }), row({ id: "b", label: "Launch" })]);
    expect(screen.queryByLabelText("Project")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    // Two rows, one group, and no heading row over them.
    expect(screen.getAllByRole("row")).toHaveLength(3); // head + two rows
  });

  it("offers one option per group, plus all of them, once there are two", () => {
    draw(TWO_PROJECTS);
    const select = screen.getByRole("combobox");
    expect(
      [...select.querySelectorAll("option")].map((option) => option.textContent),
    ).toEqual(["All projects", "Glowskin Studio website", "Booking automation"]);
  });

  it("narrows the table to one project, and back", () => {
    draw(TWO_PROJECTS);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "p-auto" } });
    expect(screen.queryByText("Deposit")).not.toBeInTheDocument();
    expect(screen.getByText("Retainer")).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "" } });
    expect(screen.getByText("Deposit")).toBeInTheDocument();
    expect(screen.getByText("Retainer")).toBeInTheDocument();
  });

  it("heads the unfiled rows 'Other payments' rather than leaving them bare", () => {
    draw([
      row({ id: "a" }),
      row({ id: "b", label: "Retainer", projectId: null, projectName: null }),
    ]);
    // In the table, not only in the filter: both say it, and the heading is
    // the one a client reads while looking at the rows under it.
    const table = screen.getByRole("table");
    expect(within(table).getByText("Other payments")).toBeInTheDocument();
    // And last, after the named project -- the rows a client has least
    // context for go at the bottom.
    const headings = [...table.querySelectorAll("tr.cp-pay__group td")].map(
      (cell) => cell.textContent,
    );
    expect(headings).toEqual(["Glowskin Studio website", "Other payments"]);
  });
});

describe("the Pay button", () => {
  it("is drawn on an unpaid row that can be paid", () => {
    draw([
      row({
        id: "b",
        label: "Content milestone",
        state: "overdue",
        payable: true,
        paidWith: null,
        paidAt: null,
      }),
    ]);
    expect(screen.getByRole("button", { name: "Pay now" })).toBeInTheDocument();
  });

  it("is not drawn on a paid row, or on one nobody has billed", () => {
    draw([row({ id: "a" }), row({ id: "c", label: "Launch", state: "later", paidWith: null, paidAt: null })]);
    expect(screen.queryByRole("button", { name: "Pay now" })).not.toBeInTheDocument();
  });
});
