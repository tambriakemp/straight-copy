// Guards the one rule the whole ventures model rests on:
// cash (revenue_ledger_v) and levels (metric_snapshots) are never summed.
//
// Imports the exact module the admin-dashboard edge function runs, so a
// regression there fails here.
import { describe, it, expect } from "vitest";
import {
  buildRollup, latestSnapshots, recurringMrrCents, launchActuals, withinWindow,
  type LedgerRow, type SnapshotRow, type VentureRow,
} from "../../supabase/functions/_shared/portfolio";

const NOW = new Date("2026-08-19T12:00:00Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString();

const VENTURES: VentureRow[] = [
  { id: "v-ttk", slug: "take-the-keys", name: "Take the Keys", kind: "training" },
  { id: "v-sub", slug: "substack", name: "Substack", kind: "newsletter" },
];

describe("portfolio roll-up", () => {
  it("sums agency invoices and venture cash, and excludes MRR from the cash total", () => {
    const ledger: LedgerRow[] = [
      // Agency: one paid invoice, $2,500.
      { stream: "agency", venture_id: null, occurred_at: daysAgo(5), amount_cents: 250_000 },
      // Venture: one training sale, $497.
      { stream: "venture", venture_id: "v-ttk", occurred_at: daysAgo(3), amount_cents: 49_700 },
    ];
    // Substack reports a $3,296/mo run-rate. This is NOT cash and must not be added.
    const snapshots: SnapshotRow[] = [
      { venture_id: "v-sub", metric_key: "mrr_cents", value: 329_600, captured_on: "2026-08-18" },
      { venture_id: "v-sub", metric_key: "paid_members", value: 412, captured_on: "2026-08-18" },
    ];

    const r = buildRollup(ledger, snapshots, VENTURES, NOW);

    expect(r.agency_30d_cents).toBe(250_000);
    expect(r.ventures_30d_cents).toBe(49_700);
    expect(r.cash_30d_cents).toBe(299_700);

    // The snapshot appears ONLY as a run-rate.
    expect(r.recurring_mrr_cents).toBe(329_600);
    // And is absent from cash — this is the double-counting guard.
    expect(r.cash_30d_cents).not.toBe(299_700 + 329_600);
  });

  it("keeps cash and run-rate on separate keys per stream", () => {
    const r = buildRollup(
      [{ stream: "venture", venture_id: "v-sub", occurred_at: daysAgo(2), amount_cents: 290_000 }],
      [{ venture_id: "v-sub", metric_key: "mrr_cents", value: 329_600, captured_on: "2026-08-18" }],
      VENTURES,
      NOW,
    );
    const sub = r.by_stream.find((s) => s.slug === "substack")!;
    // A $2,900 payout landed AND the run-rate reads $3,296 — two different numbers
    // about the same month. Neither absorbs the other.
    expect(sub.cash_30d_cents).toBe(290_000);
    expect(sub.mrr_cents).toBe(329_600);
  });

  it("excludes cash older than the 30 day window", () => {
    const ledger: LedgerRow[] = [
      { stream: "venture", venture_id: "v-ttk", occurred_at: daysAgo(10), amount_cents: 10_000 },
      { stream: "venture", venture_id: "v-ttk", occurred_at: daysAgo(45), amount_cents: 99_000 },
    ];
    const r = buildRollup(ledger, [], VENTURES, NOW);
    expect(r.ventures_30d_cents).toBe(10_000);
    // ...but the old row still shows up in the 12-month trend.
    expect(r.trend.reduce((s, t) => s + t.venture_cents, 0)).toBe(109_000);
  });

  it("nets refunds out of cash", () => {
    const r = buildRollup(
      [
        { stream: "venture", venture_id: "v-ttk", occurred_at: daysAgo(4), amount_cents: 49_700 },
        { stream: "venture", venture_id: "v-ttk", occurred_at: daysAgo(2), amount_cents: -49_700 },
      ],
      [], VENTURES, NOW,
    );
    expect(r.ventures_30d_cents).toBe(0);
  });

  it("always includes the agency as a stream, even with no ventures", () => {
    const r = buildRollup(
      [{ stream: "agency", venture_id: null, occurred_at: daysAgo(1), amount_cents: 100_000 }],
      [], [], NOW,
    );
    expect(r.by_stream).toHaveLength(1);
    expect(r.by_stream[0]).toMatchObject({ slug: "agency", cash_30d_cents: 100_000, mrr_cents: 0 });
  });

  it("reports zeroes rather than throwing on empty data", () => {
    const r = buildRollup([], [], [], NOW);
    expect(r.cash_30d_cents).toBe(0);
    expect(r.recurring_mrr_cents).toBe(0);
    expect(r.trend).toEqual([]);
  });

  it("builds a trend split by stream, oldest month first", () => {
    const r = buildRollup(
      [
        { stream: "agency", venture_id: null, occurred_at: "2026-07-10T00:00:00Z", amount_cents: 100_000 },
        { stream: "venture", venture_id: "v-ttk", occurred_at: "2026-07-20T00:00:00Z", amount_cents: 50_000 },
        { stream: "venture", venture_id: "v-ttk", occurred_at: "2026-06-02T00:00:00Z", amount_cents: 25_000 },
      ],
      [], VENTURES, NOW,
    );
    expect(r.trend).toEqual([
      { month: "2026-06", agency_cents: 0, venture_cents: 25_000 },
      { month: "2026-07", agency_cents: 100_000, venture_cents: 50_000 },
    ]);
  });
});

describe("latestSnapshots", () => {
  it("takes the newest reading per metric when rows are newest-first", () => {
    const latest = latestSnapshots([
      { venture_id: "v-sub", metric_key: "paid_members", value: 412, captured_on: "2026-08-18" },
      { venture_id: "v-sub", metric_key: "paid_members", value: 400, captured_on: "2026-08-11" },
      { venture_id: "v-sub", metric_key: "mrr_cents", value: 329_600, captured_on: "2026-08-18" },
    ]);
    expect(latest["v-sub"].paid_members).toBe(412);
    expect(latest["v-sub"].mrr_cents).toBe(329_600);
  });

  it("adds MRR across ventures and ignores non-MRR metrics", () => {
    const latest = latestSnapshots([
      { venture_id: "v-sub", metric_key: "mrr_cents", value: 300_000, captured_on: "2026-08-18" },
      { venture_id: "v-sub", metric_key: "paid_members", value: 412, captured_on: "2026-08-18" },
      { venture_id: "v-skool", metric_key: "mrr_cents", value: 150_000, captured_on: "2026-08-18" },
    ]);
    expect(recurringMrrCents(latest)).toBe(450_000);
  });
});

describe("launchActuals", () => {
  it("sums cash per launch and counts only positive rows as signups", () => {
    const actuals = launchActuals([
      { stream: "venture", venture_id: "v-ttk", launch_id: "L1", occurred_at: daysAgo(3), amount_cents: 49_700 },
      { stream: "venture", venture_id: "v-ttk", launch_id: "L1", occurred_at: daysAgo(2), amount_cents: 49_700 },
      { stream: "venture", venture_id: "v-ttk", launch_id: "L1", occurred_at: daysAgo(1), amount_cents: -49_700 },
      { stream: "venture", venture_id: "v-ttk", launch_id: null, occurred_at: daysAgo(1), amount_cents: 10_000 },
    ]);
    expect(actuals.L1.cents).toBe(49_700);
    // A refund reduces revenue but never removes a seat from the signup count.
    expect(actuals.L1.sales).toBe(2);
    expect(actuals).not.toHaveProperty("null");
  });
});

describe("withinWindow", () => {
  it("includes a row exactly on the boundary", () => {
    const rows: LedgerRow[] = [{ stream: "agency", venture_id: null, occurred_at: daysAgo(30), amount_cents: 1 }];
    expect(withinWindow(rows, NOW - 30 * 86400000)).toHaveLength(1);
  });
});
