// The rule these exist to protect: a dashboard field showing "—" must come back
// as absent, never as 0. Zeroing an unset MRR would drag the portfolio
// run-rate down and there'd be nothing on screen to show why.
import { describe, it, expect } from "vitest";
import { partitionParsedMetrics } from "../../supabase/functions/_shared/metrics-parse";

describe("partitionParsedMetrics", () => {
  it("keeps real readings and marks nulls absent", () => {
    // Mirrors the real Skool dashboard: members and engagement set, MRR not.
    const { metrics, absent } = partitionParsedMetrics({
      paid_members: 199,
      mrr_cents: null,
      engagement_pct: 8,
      retention_pct: null,
      visitors_30d: 25,
      signups_30d: 5,
      conversion_pct: 20,
      notes: "MRR and Retention showed a dash",
    });

    expect(metrics).toEqual({
      paid_members: 199,
      engagement_pct: 8,
      visitors_30d: 25,
      signups_30d: 5,
      conversion_pct: 20,
    });
    expect(absent.sort()).toEqual(["mrr_cents", "retention_pct"]);
    // The whole point — an unset MRR is not a zero MRR.
    expect(metrics).not.toHaveProperty("mrr_cents");
  });

  it("keeps a genuine zero, which is different from absent", () => {
    const { metrics, absent } = partitionParsedMetrics({ signups_30d: 0 });
    expect(metrics.signups_30d).toBe(0);
    expect(absent).toEqual([]);
  });

  it("drops commentary fields from the metrics", () => {
    const { metrics } = partitionParsedMetrics({
      paid_members: 199, notes: "fine", period_label: "Last 30 days", platform: "skool",
    });
    expect(Object.keys(metrics)).toEqual(["paid_members"]);
  });

  it("treats undefined the same as null", () => {
    const { absent } = partitionParsedMetrics({ mrr_cents: undefined });
    expect(absent).toEqual(["mrr_cents"]);
  });

  it("rejects non-numeric junk rather than storing NaN", () => {
    const { metrics, absent } = partitionParsedMetrics({
      paid_members: "not a number", mrr_cents: true, engagement_pct: 8,
    });
    expect(metrics).toEqual({ engagement_pct: 8 });
    expect(absent.sort()).toEqual(["mrr_cents", "paid_members"]);
  });

  it("accepts a numeric string, since that is still a real reading", () => {
    const { metrics } = partitionParsedMetrics({ paid_members: "199" });
    expect(metrics.paid_members).toBe(199);
  });

  it("rejects negatives, which are never real on these dashboards", () => {
    const { metrics, absent } = partitionParsedMetrics({ paid_members: -5 });
    expect(metrics).toEqual({});
    expect(absent).toEqual(["paid_members"]);
  });

  it("returns empty structures for an empty report", () => {
    expect(partitionParsedMetrics({})).toEqual({ metrics: {}, absent: [] });
  });
});
