// Every function here is a number shown to the person who runs the
// business. "Collected in 2026" being wrong is not a layout bug.
import { describe, it, expect } from "vitest";
import {
  bucketInvoices, collectedByMonth, byClient, daysUnpaid, isOverdue, billsWhen,
  isVoid, isPaid, type MoneyInvoice,
} from "@/lib/moneyRollup";

const inv = (o: Partial<MoneyInvoice> & { id: string }): MoneyInvoice => ({
  client_id: "c1", client_project_id: "p1", label: "Invoice",
  amount_cents: 100_000, status: "sent", due_date: null, ...o,
});

describe("bucketInvoices", () => {
  const all = [
    inv({ id: "paid", status: "paid", paid_at: "2026-10-08T16:00:00Z", amount_cents: 250_000 }),
    inv({ id: "old-paid", status: "paid", paid_at: "2025-07-19T16:00:00Z", amount_cents: 500_000 }),
    inv({ id: "sent", status: "sent", sent_at: "2026-06-09T16:00:00Z", amount_cents: 125_000 }),
    inv({ id: "sched", status: "scheduled", amount_cents: 250_000 }),
    inv({ id: "void", status: "voided", amount_cents: 500_000 }),
  ];
  const b = bucketInvoices(all, 2026);

  it("puts each invoice in exactly one bucket", () => {
    expect(b.paid.map((i) => i.id).sort()).toEqual(["old-paid", "paid"]);
    expect(b.chase.map((i) => i.id)).toEqual(["sent"]);
    expect(b.billsNext.map((i) => i.id)).toEqual(["sched"]);
    expect(b.voided.map((i) => i.id)).toEqual(["void"]);
  });

  it("counts collected for the named year only", () => {
    // An invoice paid last July is collected, but not collected in 2026.
    expect(b.collectedCents).toBe(250_000);
  });

  it("keeps a voided invoice out of every total", () => {
    // $5,000 of cancelled money would be the biggest number on the page.
    expect(b.collectedCents + b.owedCents + b.notBilledCents).toBe(625_000);
  });

  it("does not count a scheduled invoice as owed", () => {
    // It has not been sent. Nobody owes it yet.
    expect(b.owedCents).toBe(125_000);
    expect(b.notBilledCents).toBe(250_000);
  });

  it("puts the longest-unpaid first in the chase list", () => {
    const { chase } = bucketInvoices([
      inv({ id: "new", status: "sent", sent_at: "2026-10-01T16:00:00Z" }),
      inv({ id: "old", status: "sent", sent_at: "2026-06-09T16:00:00Z" }),
    ]);
    expect(chase.map((i) => i.id)).toEqual(["old", "new"]);
  });

  it("trusts paid_at even when the status word lags", () => {
    expect(isPaid(inv({ id: "x", status: "sent", paid_at: "2026-10-08T16:00:00Z" }))).toBe(true);
  });

  it("treats every spelling of voided the same, and voided_at too", () => {
    for (const s of ["void", "Voided", "cancelled", "CANCELED"]) {
      expect(isVoid(inv({ id: "x", status: s })), s).toBe(true);
    }
    expect(isVoid(inv({ id: "x", status: "sent", voided_at: "2026-01-01T00:00:00Z" }))).toBe(true);
  });

  it("is all zeroes for nothing", () => {
    const e = bucketInvoices([]);
    expect([e.collectedCents, e.owedCents, e.notBilledCents]).toEqual([0, 0, 0]);
  });
});

describe("daysUnpaid and isOverdue", () => {
  const now = new Date("2026-10-11T12:00:00Z");

  it("counts from when it was sent", () => {
    expect(daysUnpaid(inv({ id: "a", status: "sent", sent_at: "2026-06-09T12:00:00Z" }), now)).toBe(124);
  });

  it("stops once it is paid", () => {
    expect(daysUnpaid(inv({ id: "a", status: "paid", sent_at: "2026-06-09T12:00:00Z", paid_at: "2026-07-01T00:00:00Z" }), now)).toBeNull();
  });

  it("separates old from overdue", () => {
    // 124 days out with no due date is not late — nobody agreed a date.
    const noDate = inv({ id: "a", status: "sent", sent_at: "2026-06-09T12:00:00Z" });
    expect(daysUnpaid(noDate, now)).toBe(124);
    expect(isOverdue(noDate, now)).toBe(false);
    expect(isOverdue({ ...noDate, due_date: "2026-09-01" }, now)).toBe(true);
    expect(isOverdue({ ...noDate, due_date: "2026-12-01" }, now)).toBe(false);
  });
});

describe("collectedByMonth", () => {
  const now = new Date("2026-10-15T12:00:00Z");

  it("keeps empty months instead of dropping them", () => {
    // Three payments in May, July and October become "three months of
    // steady growth" if the gaps disappear.
    const bars = collectedByMonth([
      inv({ id: "a", status: "paid", paid_at: "2026-05-12T16:00:00Z", amount_cents: 500_000 }),
      inv({ id: "b", status: "paid", paid_at: "2026-07-19T16:00:00Z", amount_cents: 1_000_000 }),
      inv({ id: "c", status: "paid", paid_at: "2026-10-08T16:00:00Z", amount_cents: 250_000 }),
    ], 6, now);
    expect(bars).toHaveLength(6);
    expect(bars.map((b) => b.cents)).toEqual([500_000, 0, 1_000_000, 0, 0, 250_000]);
    expect(bars[0].label).toBe("May");
    expect(bars[5].label).toBe("Oct");
  });

  it("ignores anything outside the window and anything unpaid", () => {
    const bars = collectedByMonth([
      inv({ id: "old", status: "paid", paid_at: "2025-10-08T16:00:00Z" }),
      inv({ id: "sent", status: "sent", sent_at: "2026-10-08T16:00:00Z" }),
      inv({ id: "void", status: "voided", paid_at: "2026-10-08T16:00:00Z" }),
    ], 6, now);
    expect(bars.every((b) => b.cents === 0)).toBe(true);
  });

  it("adds up several payments in one month", () => {
    const bars = collectedByMonth([
      inv({ id: "a", status: "paid", paid_at: "2026-10-02T16:00:00Z", amount_cents: 100 }),
      inv({ id: "b", status: "paid", paid_at: "2026-10-09T16:00:00Z", amount_cents: 200 }),
    ], 6, now);
    expect(bars[5].cents).toBe(300);
  });
});

describe("byClient", () => {
  it("splits each client's money and sorts by what they are worth", () => {
    const rows = byClient([
      inv({ id: "a", client_id: "big", status: "paid", paid_at: "2026-01-01T00:00:00Z", amount_cents: 1_750_000 }),
      inv({ id: "b", client_id: "big", status: "scheduled", amount_cents: 250_000 }),
      inv({ id: "c", client_id: "small", status: "sent", amount_cents: 125_000 }),
    ], ["big", "small", "none"]);
    expect(rows.map((r) => r.clientId)).toEqual(["big", "small", "none"]);
    expect(rows[0]).toMatchObject({ paidCents: 1_750_000, toBillCents: 250_000, totalCents: 2_000_000 });
    expect(rows[1]).toMatchObject({ owedCents: 125_000 });
  });

  it("keeps a client with no invoices, at zero", () => {
    // "No invoices yet" is a fact about that client worth seeing.
    const rows = byClient([], ["nobody"]);
    expect(rows).toHaveLength(1);
    expect(rows[0].totalCents).toBe(0);
  });

  it("leaves voided money out of a client's total", () => {
    const rows = byClient([inv({ id: "v", client_id: "c", status: "voided", amount_cents: 500_000 })], ["c"]);
    expect(rows[0].totalCents).toBe(0);
  });
});

describe("billsWhen", () => {
  it("says what triggers the bill and when it is due after that", () => {
    expect(billsWhen(inv({ id: "a", trigger: "on_completion", due_days: 14 })))
      .toBe("Bills when the work is complete · due 14 days after sending");
    expect(billsWhen(inv({ id: "a", trigger: "on_signature" }))).toBe("Bills when the client signs");
  });

  it("falls back to the date, then to saying there is no trigger", () => {
    expect(billsWhen(inv({ id: "a", due_date: "2026-12-01" }))).toContain("2026-12-01");
    expect(billsWhen(inv({ id: "a" }))).toBe("No trigger set");
  });
});
