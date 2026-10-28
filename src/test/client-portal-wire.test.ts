/**
 * The client-portal wire contract: the mirror, and the pure helpers.
 *
 * Two jobs.
 *
 * **The mirror cannot drift.** `supabase/functions/_shared/client-portal-wire.ts`
 * is the canonical copy and `src/lib/clientPortalWire.ts` is the half the
 * browser compiles against, because `tsconfig.app.json` includes only `src`.
 * The repo convention for a shared module is a comment saying "keep both in
 * sync", which is a rule nothing enforces. This enforces it, and prints the
 * first differing line rather than a wall of diff.
 *
 * **The helpers decide what a client believes.** `ladder` decides which step
 * of their project a client thinks they are on; `paymentState` decides
 * whether they think they owe money today. Neither is a layout detail, so
 * both are pure and both are tested here rather than inside a component that
 * would need a browser to exercise.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  initialsFor,
  instalmentSummary,
  ladder,
  monogramFor,
  paymentState,
  paymentTotals,
  stepPosition,
  type PaymentRow,
} from "../lib/clientPortalWire";

const SPLIT = "// ===========================================================================\n";

function bodyOf(file: string): string {
  const text = readFileSync(path.resolve(__dirname, "../..", file), "utf8");
  const index = text.indexOf(SPLIT);
  if (index === -1) {
    throw new Error(`${file} has no header separator; the mirror check cannot run.`);
  }
  return text.slice(index + SPLIT.length);
}

describe("the mirror", () => {
  it("is identical to the canonical copy below the header", () => {
    const canonical = bodyOf("supabase/functions/_shared/client-portal-wire.ts");
    const mirror = bodyOf("src/lib/clientPortalWire.ts");
    if (canonical === mirror) {
      expect(canonical.length).toBeGreaterThan(0);
      return;
    }
    const a = canonical.split("\n");
    const b = mirror.split("\n");
    const at = a.findIndex((line, index) => line !== b[index]);
    throw new Error(
      `The wire contract copies have drifted at line ${at + 1} below the header.\n` +
        `  canonical: ${JSON.stringify(a[at] ?? "<end of file>")}\n` +
        `  mirror:    ${JSON.stringify(b[at] ?? "<end of file>")}\n` +
        "Edit supabase/functions/_shared/client-portal-wire.ts and copy it across.",
    );
  });
});

describe("initials", () => {
  it("takes the first and last words", () => {
    expect(initialsFor("Maya Chen")).toBe("MC");
    expect(initialsFor("  ana  patel ")).toBe("AP");
    expect(initialsFor("Maria del Carmen Ruiz")).toBe("MR");
  });

  it("gives one letter for one word, not two from the same word", () => {
    expect(initialsFor("Maya")).toBe("M");
  });

  it("answers for an empty name rather than throwing", () => {
    expect(initialsFor("   ")).toBe("?");
  });
});

describe("the monogram on the tile beside the agency name (CRE-797)", () => {
  it("takes what the install configured, whatever the name is", () => {
    // The case the field exists for: a mark that is not the initials of the
    // name. There is no other way for an agency to say so.
    expect(monogramFor("C8", "Cre8 Visions")).toBe("C8");
    expect(monogramFor("&", "Hart & Co")).toBe("&");
  });

  it("falls back to the initials of the agency name, not to anybody's mark", () => {
    expect(monogramFor(null, "Northhill Studio")).toBe("NS");
    expect(monogramFor(undefined, "Northhill Studio")).toBe("NS");
    // Blank and whitespace are "not configured", not "configured as empty".
    expect(monogramFor("", "Northhill Studio")).toBe("NS");
    expect(monogramFor("   ", "Northhill Studio")).toBe("NS");
  });

  it("draws no tile when the install says none", () => {
    // A wordmark that wants no tile beside it is a design decision, and the
    // alternative is initials a licensee deliberately did not ask for.
    expect(monogramFor("none", "Northhill Studio")).toBeNull();
    expect(monogramFor("None", "Northhill Studio")).toBeNull();
    expect(monogramFor("  NONE  ", "Northhill Studio")).toBeNull();
  });

  it("draws no tile rather than a question mark", () => {
    // `initialsFor` answers "?" for a blank name. A question-mark tile reads
    // to a client as a bug on their own portal.
    expect(monogramFor(null, "   ")).toBeNull();
    expect(monogramFor(null, "")).toBeNull();
  });

  it("clips a long value to three characters, and never to half of one", () => {
    // The tile is a 28px square. A sentence in it is a smear, not a mark.
    expect(monogramFor("Northhill Studio", "Northhill Studio")).toBe("Nor");
    // Clipped by character and not by UTF-16 unit: `slice(0, 3)` on an
    // astral-plane mark would hand the browser a lone surrogate.
    expect(monogramFor("🅝🅢", "Northhill Studio")).toBe("🅝🅢");
    expect(Array.from(monogramFor("🅝🅢🅒🅞", "x") ?? "")).toHaveLength(3);
  });
});

describe("the progress ladder", () => {
  const steps = [
    { key: "kickoff", label: "Kickoff", done: true },
    { key: "agreement", label: "Agreement", done: true },
    { key: "brand", label: "Brand", done: true },
    { key: "words", label: "Words & design", done: true },
    { key: "build", label: "Building", done: false },
    { key: "review", label: "Your review", done: false },
    { key: "launch", label: "Launch", done: false },
  ];

  it("marks the first unfinished step as now, and the one after it as next", () => {
    const rungs = ladder(steps);
    expect(rungs.map((rung) => rung.state)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "now",
      "next",
      "later",
    ]);
  });

  it("reads mockup 13 back: step 5 of 7", () => {
    expect(stepPosition(ladder(steps))).toEqual({ stepNumber: 5, stepCount: 7 });
  });

  it("keeps a step that was finished out of order finished", () => {
    const outOfOrder = [
      { key: "a", label: "A", done: false },
      { key: "b", label: "B", done: true },
      { key: "c", label: "C", done: false },
    ];
    // B stays done. Demoting it would tell the client it has to happen again.
    expect(ladder(outOfOrder).map((rung) => rung.state)).toEqual(["now", "done", "next"]);
  });

  it("carries the client-facing label verbatim", () => {
    // A licensee renamed the phase for their client. The renamer owns that
    // string, so nothing here title-cases, trims or prettifies it.
    const rungs = ladder([{ key: "build", label: "building your site", done: false }]);
    expect(rungs[0].label).toBe("building your site");
  });

  it("has no step in flight once everything is done", () => {
    const finished = steps.map((step) => ({ ...step, done: true }));
    const rungs = ladder(finished);
    expect(rungs.every((rung) => rung.state === "done")).toBe(true);
    // A finished project should read as finished, not as "step 7 of 7".
    expect(stepPosition(rungs)).toBeNull();
  });

  it("has no position when nothing is shared at all", () => {
    expect(stepPosition([])).toBeNull();
    expect(ladder([])).toEqual([]);
  });
});

describe("whether a payment can be paid", () => {
  const now = new Date("2026-10-28T12:00:00.000Z");

  it("is paid when it is paid, whatever else is true of it", () => {
    expect(
      paymentState({ paidAt: "2026-10-03T00:00:00Z", issued: false, dueOn: "2020-01-01", now }),
    ).toBe("paid");
  });

  it("is ready once it has been billed", () => {
    expect(paymentState({ paidAt: null, issued: true, dueOn: "2026-11-14", now })).toBe("ready");
  });

  it("is overdue when it was billed and the date has gone", () => {
    expect(paymentState({ paidAt: null, issued: true, dueOn: "2026-10-03", now })).toBe("overdue");
  });

  it("is later when it is scheduled but nobody has billed it", () => {
    // Including one whose date has passed. A date is a plan; billing is the
    // event. "Ready to pay" here produces a client trying to pay an amount
    // the agency has no record of asking for.
    expect(paymentState({ paidAt: null, issued: false, dueOn: "2026-10-03", now })).toBe("later");
    expect(paymentState({ paidAt: null, issued: false, dueOn: null, now })).toBe("later");
  });

  it("treats an unparseable date as no date rather than as overdue", () => {
    expect(paymentState({ paidAt: null, issued: true, dueOn: "before launch", now })).toBe("ready");
  });
});

describe("the money tiles", () => {
  function row(over: Partial<PaymentRow>): PaymentRow {
    return {
      id: "i1",
      label: "Deposit",
      dueOn: null,
      dueNote: null,
      amountCents: 0,
      currency: "USD",
      state: "later",
      paidWith: null,
      paidAt: null,
      receiptUrl: null,
      payable: false,
      ...over,
    };
  }

  it("reads mockup 15 back", () => {
    const rows = [
      row({ id: "a", label: "Deposit", amountCents: 120_000, state: "paid", dueOn: "2026-10-03" }),
      row({ id: "b", label: "Design approved", amountCents: 240_000, state: "ready", dueOn: "2026-11-14" }),
      row({ id: "c", label: "Launch", amountCents: 120_000, state: "later", dueNote: "Before launch" }),
    ];
    expect(paymentTotals(rows)).toEqual({
      totalCents: 480_000,
      paidCents: 120_000,
      next: { amountCents: 240_000, dueOn: "2026-11-14" },
    });
  });

  it("takes the next one to fall due, not the next one in the list", () => {
    const rows = [
      row({ id: "late", amountCents: 500, dueOn: "2026-12-01" }),
      row({ id: "soon", amountCents: 100, dueOn: "2026-11-01" }),
    ];
    expect(paymentTotals(rows).next).toEqual({ amountCents: 100, dueOn: "2026-11-01" });
  });

  it("sorts an undated instalment last", () => {
    // "Before launch" is not sooner than a dated one just because nobody
    // dated it.
    const rows = [
      row({ id: "undated", amountCents: 100, dueOn: null }),
      row({ id: "dated", amountCents: 200, dueOn: "2026-11-01" }),
    ];
    expect(paymentTotals(rows).next).toEqual({ amountCents: 200, dueOn: "2026-11-01" });
  });

  it("has no next when everything is paid", () => {
    const rows = [row({ amountCents: 100, state: "paid" })];
    expect(paymentTotals(rows)).toEqual({ totalCents: 100, paidCents: 100, next: null });
  });
});

describe("the instalment line under the investment table", () => {
  const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

  it("reads mockup 14 back", () => {
    expect(
      instalmentSummary(
        [
          { label: "Deposit", amountCents: 208_000 },
          { label: "at design approval", amountCents: 156_000 },
          { label: "before launch", amountCents: 156_000 },
        ],
        money,
      ),
    ).toBe("Deposit $2,080 · at design approval $1,560 · before launch $1,560");
  });

  it("says nothing for a single instalment", () => {
    // "Deposit $5,200" under a total of $5,200 is noise.
    expect(instalmentSummary([{ label: "Deposit", amountCents: 520_000 }], money)).toBeNull();
    expect(instalmentSummary([], money)).toBeNull();
  });
});
