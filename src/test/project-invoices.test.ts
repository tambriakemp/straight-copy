// These are figures a client is billed against. "Paid $17,500 of
// $20,000" over invoices adding to $18,000 is a page nobody can use to
// answer "what do they still owe".
import { describe, it, expect } from "vitest";
import { invoiceSummary, invoiceLine, INVOICE_STATUS, type InvoiceLike } from "@/lib/projectInvoices";

const inv = (o: Partial<InvoiceLike> & { amount_cents: number }): InvoiceLike =>
  ({ status: "scheduled", ...o });

describe("invoiceSummary", () => {
  it("totals the invoices, not whatever the schedule says its total is", () => {
    // A schedule created from a signed proposal keeps a total that stops
    // matching the moment someone edits a line.
    const out = invoiceSummary([
      { invoices: [inv({ amount_cents: 500000, status: "paid" }), inv({ amount_cents: 500000, status: "paid" })] },
      { invoices: [inv({ amount_cents: 250000, status: "paid" }), inv({ amount_cents: 250000 })] },
    ]);
    expect(out.totalCents).toBe(1500000);
    expect(out.paidCents).toBe(1250000);
    expect(out.remainingCents).toBe(250000);
  });

  it("leaves voided invoices out of both sides", () => {
    const out = invoiceSummary([{
      invoices: [inv({ amount_cents: 100000, status: "paid" }), inv({ amount_cents: 900000, status: "void" })],
    }]);
    expect(out.totalCents).toBe(100000);
    expect(out.paidCents).toBe(100000);
    expect(out.pct).toBe(100);
  });

  it("floors the percentage, so an unpaid invoice never sits under a full bar", () => {
    const out = invoiceSummary([{
      invoices: [inv({ amount_cents: 99900, status: "paid" }), inv({ amount_cents: 100 })],
    }]);
    expect(out.pct).toBe(99);
  });

  it("is zero, not NaN, with nothing to divide by", () => {
    const out = invoiceSummary([]);
    expect(out).toMatchObject({ totalCents: 0, paidCents: 0, remainingCents: 0, pct: 0 });
    expect(out.blurb).toContain("No invoices yet");
  });

  it("never reports a negative remainder when an overpayment is recorded", () => {
    const out = invoiceSummary([{
      invoices: [inv({ amount_cents: 100, status: "paid" })],
    }]);
    expect(out.remainingCents).toBe(0);
  });

  it("counts schedules and invoices in the line under the bar", () => {
    const out = invoiceSummary([
      { invoices: [inv({ amount_cents: 100, status: "paid" })] },
      { invoices: [inv({ amount_cents: 100 })] },
    ]);
    expect(out.blurb).toBe("1 of 2 invoices paid across 2 schedules. Invoices are sent through SureCart.");
  });
});

describe("invoiceLine", () => {
  it("says what has happened, in the order it happened", () => {
    expect(invoiceLine(inv({
      amount_cents: 1, due_date: "2026-05-12", sent_at: "2026-05-01T10:00:00Z", paid_at: "2026-05-12T10:00:00Z",
    }))).toBe("Due May 12, 2026 · Sent May 1, 2026 · Paid May 12, 2026");
  });

  it("says 'No due date' out loud rather than leaving a blank", () => {
    // A blank line reads as missing data and someone goes looking for it.
    expect(invoiceLine(inv({ amount_cents: 1 }))).toBe("No due date");
  });

  it("reads a date-only due_date in the reader's day, not the day before", () => {
    // "2026-05-12" parsed as midnight UTC is May 11 for most of the US.
    expect(invoiceLine(inv({ amount_cents: 1, due_date: "2026-05-12" }))).toContain("May 12, 2026");
  });

  it("ignores a timestamp it cannot read", () => {
    expect(invoiceLine(inv({ amount_cents: 1, due_date: "not a date" }))).toBe("No due date");
  });
});

describe("INVOICE_STATUS", () => {
  it("names every status the table can hold", () => {
    for (const s of ["scheduled", "sent", "paid", "failed", "void"]) {
      expect(INVOICE_STATUS[s], s).toBeTruthy();
    }
  });
});
