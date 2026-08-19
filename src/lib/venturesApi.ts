// Thin client for the ventures-api edge function.
//
// Mirrors how AdminDashboard talks to admin-dashboard: attach the current
// Supabase session token and fetch the function URL directly.
import { supabase } from "@/integrations/supabase/client";

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ventures-api`;

/** Narrow an unknown catch value to a displayable message. */
export const errMsg = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === "string" ? e : "";

export async function venturesApi<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const payload = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
  return payload as T;
}

export type Venture = {
  id: string;
  slug: string;
  name: string;
  kind: "training" | "newsletter" | "community" | "other";
  status: string;
  currency: string;
  description: string | null;
  brand_color: string | null;
  platform: string | null;
  platform_account_ref: string | null;
  funnel_stages: Array<{ key: string; label: string }>;
  public_ingest_key: string | null;
  goal_mrr_cents: number | null;
  goal_members: number | null;
  cash_30d_cents?: number;
  latest_metrics?: Record<string, number>;
};

export type Launch = {
  id: string;
  venture_id: string;
  name: string;
  slug: string;
  status: string;
  cart_open_at: string | null;
  cart_close_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  ticket_price_cents: number | null;
  goal_revenue_cents: number | null;
  goal_signups: number | null;
  notes: string | null;
};

export type RevenueEntry = {
  id: string;
  occurred_at: string;
  amount_cents: number;
  kind: string;
  source: string;
  customer_email: string | null;
  customer_name: string | null;
  description: string | null;
  launch_id: string | null;
};

export type ChecklistItem = {
  id: string;
  key: string;
  label: string;
  status: "pending" | "in_progress" | "complete" | "skipped";
  order_index: number;
  due_date: string | null;
  notes: string | null;
  completed_at: string | null;
};

/**
 * Metric keys we prompt for per venture kind. `mrr_cents` is the only one that
 * feeds the portfolio run-rate tile; the rest are context.
 */
export const METRIC_KEYS: Record<string, Array<{ key: string; label: string; money?: boolean }>> = {
  newsletter: [
    { key: "paid_members", label: "Paid subscribers" },
    { key: "free_members", label: "Free subscribers" },
    { key: "mrr_cents", label: "MRR", money: true },
  ],
  community: [
    { key: "paid_members", label: "Paid members" },
    { key: "free_members", label: "Free members" },
    { key: "mrr_cents", label: "MRR", money: true },
  ],
  training: [
    { key: "paid_members", label: "Active students" },
    { key: "mrr_cents", label: "MRR", money: true },
  ],
  other: [
    { key: "paid_members", label: "Paid members" },
    { key: "mrr_cents", label: "MRR", money: true },
  ],
};

export const KIND_LABEL: Record<string, string> = {
  training: "Live training",
  newsletter: "Newsletter",
  community: "Community",
  other: "Other",
};
