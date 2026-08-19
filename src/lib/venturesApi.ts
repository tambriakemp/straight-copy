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
/**
 * Metric keys we prompt for per venture kind.
 *
 * `mrr_cents` is the only one that feeds the portfolio run-rate tile — the rest
 * are context. `pct` values are stored as plain percents (8% is 8), money in
 * cents, everything else as a count.
 */
export const METRIC_KEYS: Record<string, MetricDef[]> = {
  newsletter: [
    { key: "paid_members", label: "Paid subscribers" },
    { key: "free_members", label: "Free subscribers" },
    { key: "mrr_cents", label: "MRR", money: true },
  ],
  community: [
    { key: "paid_members", label: "Members" },
    { key: "free_members", label: "Free members" },
    { key: "mrr_cents", label: "MRR", money: true },
    { key: "engagement_pct", label: "Engagement", pct: true },
    { key: "retention_pct", label: "Retention", pct: true },
    { key: "visitors_30d", label: "Visitors (30d)" },
    { key: "signups_30d", label: "Signups (30d)" },
    { key: "conversion_pct", label: "Conversion rate", pct: true },
    { key: "new_mrr_cents", label: "New MRR (30d)", money: true },
    { key: "discovery_rank", label: "Discovery rank" },
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

export interface MetricDef {
  key: string;
  label: string;
  /** Entered in dollars, stored in cents. */
  money?: boolean;
  /** Entered and stored as a plain percent number. */
  pct?: boolean;
}

export interface ParsedMetrics {
  /** Values read off the screenshots, in storage units (cents for money). */
  metrics: Record<string, number>;
  /** Fields that were visible but showed a dash — deliberately not zero. */
  absent: string[];
  notes: string;
  period_label: string | null;
  platform: string | null;
}

/**
 * Send screenshots to be read. Returns values for review — this never writes
 * anything, so a misread costs a correction, not a corrupted snapshot.
 */
export async function parseMetricsFromImages(
  images: Array<{ media_type: string; data: string }>,
  ventureKind?: string,
): Promise<ParsedMetrics> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-metrics-image`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ images, venture_kind: ventureKind }),
    },
  );
  const payload = (await res.json().catch(() => ({}))) as ParsedMetrics & { error?: string };
  if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);
  return payload;
}

/**
 * Downscale and re-encode a screenshot before upload.
 *
 * Keeps requests well under the 5MB per-image ceiling and cuts token cost.
 * 1600px wide is plenty to read dashboard figures accurately.
 */
export function fileToImagePayload(
  file: File,
  maxWidth = 1600,
): Promise<{ media_type: string; data: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not read that image"));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      resolve({ media_type: "image/jpeg", data: dataUrl.split(",")[1] });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image")); };
    img.src = url;
  });
}

export const KIND_LABEL: Record<string, string> = {
  training: "Live training",
  newsletter: "Newsletter",
  community: "Community",
  other: "Other",
};
