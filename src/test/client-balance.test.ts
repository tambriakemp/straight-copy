// Every line on the client page's Balance due card is a decision about
// money, and all of them render plausibly when they are wrong: a voided
// invoice silently inflating what the client owes, the wrong invoice named
// as the next one, a full bar on a client who has paid nothing.
import { describe, it, expect } from "vitest";
import { summarise, usd, NO_BALANCE, type BalanceInvoice } from "@/lib/clientBalance";

function inv(over: Partial<BalanceInvoice> & { id: string }): BalanceInvoice {
  return { label: `Invoice ${over.id}`, amount_cents: 100_000, due_date: null, status: "draft", ...over };
}

describe("summarise", () => {
  it("adds up what is owed and what is paid", () => {
    const b = summarise([
      inv({ id: "1", amount_cents: 1_750_000, status: "paid" }),
      inv({ id: "2", amount_cents: 250_000, status: "draft" }),
    ]);
    expect(b.totalCents).toBe(2_000_000);
    expect(b.paidCents).toBe(1_750_000);
    expect(b.dueCents).toBe(250_000);
    expect(b.pct).toBe(87);
  });

  it("leaves a voided invoice out of the total", () => {
    // Cancelled money is not money. Counting it has the client owing a
    // balance nobody is ever going to send them.
    const b = summarise([
      inv({ id: "1", amount_cents: 100_000, status: "paid" }),
      inv({ id: "2", amount_cents: 900_000, status: "void" }),
    ]);
    expect(b.totalCents).toBe(100_000);
    expect(b.dueCents).toBe(0);
    expect(b.pct).toBe(100);
  });

  it("treats the several spellings of voided the same", () => {
    for (const s of ["void", "Voided", "cancelled", "CANCELED"]) {
      expect(summarise([inv({ id: "1", status: s })]), s).toEqual(NO_BALANCE);
    }
  });

  it("names the earliest unpaid invoice as the next one", () => {
    const b = summarise([
      inv({ id: "late", due_date: "2026-12-01" }),
      inv({ id: "soon", due_date: "2026-10-15" }),
      inv({ id: "done", due_date: "2026-09-01", status: "paid" }),
    ]);
    expect(b.next?.id).toBe("soon");
  });

  it("puts an undated invoice last, not first", () => {
    // A final payment with no date is not urgent, and sorting it to the
    // front would make every client's card about the same invoice.
    const b = summarise([inv({ id: "undated" }), inv({ id: "dated", due_date: "2026-11-01" })]);
    expect(b.next?.id).toBe("dated");
  });

  it("says Paid in full when nothing is outstanding", () => {
    const b = summarise([inv({ id: "1", status: "paid" })]);
    expect(b.next).toBeNull();
    expect(b.nextLabel).toBe("Paid in full");
    expect(b.pct).toBe(100);
  });

  it("is empty for no invoices and for only voided ones", () => {
    expect(summarise([])).toEqual(NO_BALANCE);
    expect(NO_BALANCE.pct).toBe(0);
    expect(NO_BALANCE.empty).toBe(true);
  });

  it("names where an unpaid invoice has got to", () => {
    const at = (status: string) => summarise([inv({ id: "1", status })]).nextLabel;
    expect(at("draft")).toBe("Not sent yet");
    expect(at("scheduled")).toBe("Not sent yet");
    expect(at("sent")).toBe("Sent, unpaid");
    expect(at("overdue")).toBe("Overdue");
  });

  it("prints an unfamiliar status rather than guessing at it", () => {
    // These come from an edge function over a table this app does not own.
    expect(summarise([inv({ id: "1", status: "awaiting_wire" })]).nextLabel).toBe("awaiting_wire");
  });
});

describe("usd", () => {
  it("drops the cents when there are none", () => {
    // "$2,500" reads as a figure; "$2,500.00" reads as a line on a statement.
    expect(usd(250_000)).toBe("$2,500");
  });

  it("keeps them when there are some", () => {
    expect(usd(68_084)).toBe("$680.84");
  });

  it("handles zero", () => {
    expect(usd(0)).toBe("$0");
  });
});
