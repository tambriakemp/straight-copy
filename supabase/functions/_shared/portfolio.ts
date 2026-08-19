// Portfolio roll-up math.
//
// Pure functions, no Deno APIs, so the same code the dashboard runs is covered
// by vitest from src/test/portfolio.test.ts.
//
// The one invariant everything here exists to protect:
//
//   CASH and LEVELS are never added together.
//
// `revenue_ledger_v` rows are cash — a paid invoice or a recorded payment.
// `metric_snapshots` rows are levels — "412 paid Substack subs today". Substack
// and Skool bill their own members, so their MRR is a reading, not money that
// landed in an account. Summing a run-rate into collected cash would count every
// community dollar twice, so the two travel under separate keys all the way to
// separate tiles in the UI.

export interface LedgerRow {
  stream: "agency" | "venture" | string;
  venture_id: string | null;
  launch_id?: string | null;
  occurred_at: string;
  amount_cents: number | null;
}

export interface SnapshotRow {
  venture_id: string;
  metric_key: string;
  value: number | string;
  captured_on: string;
}

export interface VentureRow {
  id: string;
  slug: string;
  name: string;
  kind: string;
  brand_color?: string | null;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

const cents = (rows: LedgerRow[]) => rows.reduce((s, r) => s + (r.amount_cents || 0), 0);

/** Ledger rows on or after `sinceMs`. */
export function withinWindow(rows: LedgerRow[], sinceMs: number): LedgerRow[] {
  return rows.filter((r) => new Date(r.occurred_at).getTime() >= sinceMs);
}

/**
 * Latest reading per (venture, metric).
 *
 * Callers read latest_metric_snapshots_v, which already returns one row per key.
 * The first-hit-wins rule below also makes this correct for a raw newest-first
 * snapshot query, so the function is safe either way.
 */
export function latestSnapshots(rows: SnapshotRow[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const s of rows) {
    const bucket = (out[s.venture_id] ||= {});
    if (!(s.metric_key in bucket)) bucket[s.metric_key] = Number(s.value);
  }
  return out;
}

/** Sum of the current mrr_cents reading across ventures. A run-rate, not cash. */
export function recurringMrrCents(latest: Record<string, Record<string, number>>): number {
  return Object.values(latest).reduce((s, m) => s + (m.mrr_cents || 0), 0);
}

export interface Rollup {
  cash_30d_cents: number;
  agency_30d_cents: number;
  ventures_30d_cents: number;
  recurring_mrr_cents: number;
  by_stream: Array<{
    venture_id: string | null;
    slug: string;
    name: string;
    kind: string;
    brand_color?: string | null;
    cash_30d_cents: number;
    mrr_cents: number;
    members: number | null;
  }>;
  trend: Array<{ month: string; agency_cents: number; venture_cents: number }>;
}

export function buildRollup(
  ledger: LedgerRow[],
  snapshots: SnapshotRow[],
  ventures: VentureRow[],
  now: number = Date.now(),
): Rollup {
  const ledger30 = withinWindow(ledger, now - 30 * DAY_MS);
  const agency_30d_cents = cents(ledger30.filter((r) => r.stream === "agency"));
  const ventures_30d_cents = cents(ledger30.filter((r) => r.stream === "venture"));

  const latest = latestSnapshots(snapshots);

  const ventureCash30: Record<string, number> = {};
  for (const r of ledger30) {
    if (r.stream === "venture" && r.venture_id) {
      ventureCash30[r.venture_id] = (ventureCash30[r.venture_id] || 0) + (r.amount_cents || 0);
    }
  }

  const monthly: Record<string, { agency_cents: number; venture_cents: number }> = {};
  for (const r of ledger) {
    const month = String(r.occurred_at).slice(0, 7);
    const bucket = (monthly[month] ||= { agency_cents: 0, venture_cents: 0 });
    if (r.stream === "agency") bucket.agency_cents += r.amount_cents || 0;
    else bucket.venture_cents += r.amount_cents || 0;
  }

  return {
    // Cash only. Note the absence of recurring_mrr_cents from this sum.
    cash_30d_cents: agency_30d_cents + ventures_30d_cents,
    agency_30d_cents,
    ventures_30d_cents,
    recurring_mrr_cents: recurringMrrCents(latest),
    by_stream: [
      {
        venture_id: null, slug: "agency", name: "Agency", kind: "agency",
        cash_30d_cents: agency_30d_cents, mrr_cents: 0, members: null,
      },
      ...ventures.map((v) => ({
        venture_id: v.id,
        slug: v.slug,
        name: v.name,
        kind: v.kind,
        brand_color: v.brand_color ?? null,
        cash_30d_cents: ventureCash30[v.id] || 0,
        mrr_cents: latest[v.id]?.mrr_cents || 0,
        members: latest[v.id]?.paid_members ?? null,
      })),
    ],
    trend: Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v })),
  };
}

/** Per-launch actuals, computed from the ledger so they can never go stale. */
export function launchActuals(ledger: LedgerRow[]): Record<string, { cents: number; sales: number }> {
  const out: Record<string, { cents: number; sales: number }> = {};
  for (const r of ledger) {
    if (!r.launch_id) continue;
    const bucket = (out[r.launch_id] ||= { cents: 0, sales: 0 });
    bucket.cents += r.amount_cents || 0;
    // A refund is negative cash but not a signup, so only positives count.
    if ((r.amount_cents || 0) > 0) bucket.sales += 1;
  }
  return out;
}
