// payment_terms is a jsonb column written by the upload form and by
// agents, so it arrives as whatever was put in it — and a percentage
// shown against the wrong total is money, stated wrongly, to a client who
// is about to sign it.
import { describe, it, expect } from "vitest";
import { termRows, describeTerm, termsCoverTotal } from "@/lib/proposalTerms";

const half = [
  { label: "Deposit", trigger: "on_signature", amountType: "percent", amountValue: 50 },
  { label: "Final", trigger: "on_completion", amountType: "percent", amountValue: 50 },
];

describe("termRows", () => {
  it("turns percentages into money against the total", () => {
    const rows = termRows(half, 500_000);
    expect(rows.map((r) => r.amountCents)).toEqual([250_000, 250_000]);
    expect(rows[0].share).toBe("50%");
  });

  it("leaves a percentage as a percentage when there is no total", () => {
    // Without a total it would silently become $0, which reads as free.
    const rows = termRows(half, null);
    expect(rows[0].amountCents).toBeNull();
    expect(rows[0].share).toBe("50%");
  });

  it("takes a fixed amount as dollars", () => {
    const rows = termRows([{ label: "Deposit", trigger: "date", amountType: "fixed", amountValue: 1500 }], null);
    expect(rows[0].amountCents).toBe(150_000);
    expect(rows[0].share).toBe("$1,500");
  });

  it("reads a number someone typed with a % or $ on it", () => {
    const rows = termRows([{ label: "Deposit", trigger: "on_signature", amountType: "percent", amountValue: "50%" }], 500_000);
    expect(rows[0].amountCents).toBe(250_000);
  });

  it("drops a row that is not a usable term rather than printing a blank line", () => {
    // An empty line in a payment schedule reads as a payment nobody has
    // named yet, which is more alarming than a row that was never valid.
    const rows = termRows([
      { label: "", amountValue: 50 },
      { label: "Deposit" },
      null,
      "nonsense",
      { label: "Final", trigger: "on_completion", amountType: "percent", amountValue: 100 },
    ], 100_000);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("Final");
  });

  it("is empty for anything that is not an array", () => {
    for (const v of [null, undefined, {}, "", 3]) expect(termRows(v, 1000), String(v)).toEqual([]);
  });

  it("marks an unrecognised trigger rather than guessing one", () => {
    const rows = termRows([{ label: "X", trigger: "whenever", amountType: "fixed", amountValue: 10 }], null);
    expect(rows[0].trigger).toBe("unknown");
  });
});

describe("describeTerm", () => {
  const [deposit, final] = termRows(half, 500_000);

  it("speaks to the admin by default and to the client on request", () => {
    expect(describeTerm(deposit)).toBe("On signature");
    expect(describeTerm(deposit, true)).toBe("Due when you sign");
    expect(describeTerm(final, true)).toBe("Due when the work is complete");
  });

  it("adds the share only when the money is unknown", () => {
    // Otherwise the line says "50%" next to a column already showing
    // "$2,500", which is the same fact twice.
    const [noTotal] = termRows(half, null);
    expect(describeTerm(noTotal)).toContain("50%");
    expect(describeTerm(deposit)).not.toContain("50%");
  });

  it("says so when no trigger was set", () => {
    const [x] = termRows([{ label: "X", trigger: "", amountType: "fixed", amountValue: 1 }], null);
    expect(describeTerm(x)).toContain("No trigger set");
  });
});

describe("termsCoverTotal", () => {
  it("is true when the instalments add up", () => {
    expect(termsCoverTotal(termRows(half, 500_000), 500_000)).toBe(true);
  });

  it("is false when one is missing", () => {
    const short = termRows([half[0]], 500_000);
    expect(termsCoverTotal(short, 500_000)).toBe(false);
  });

  it("tolerates a cent of rounding across percentage terms", () => {
    const thirds = termRows([
      { label: "A", trigger: "date", amountType: "percent", amountValue: 33.33 },
      { label: "B", trigger: "date", amountType: "percent", amountValue: 33.33 },
      { label: "C", trigger: "date", amountType: "percent", amountValue: 33.34 },
    ], 100_000);
    expect(termsCoverTotal(thirds, 100_000)).toBe(true);
  });

  it("says nothing rather than false when it cannot tell", () => {
    expect(termsCoverTotal([], 500_000)).toBeNull();
    expect(termsCoverTotal(termRows(half, null), null)).toBeNull();
  });
});
