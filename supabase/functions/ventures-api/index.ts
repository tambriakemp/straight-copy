// Ventures API — CRUD + analytics for non-client revenue streams.
//
// Router shape follows supabase/functions/crm-api/index.ts (path split into
// `parts`, zod-validated bodies, service-role client).
//
// Auth accepts EITHER:
//   * an admin session JWT (the admin UI), same check as admin-dashboard, or
//   * an api_tokens bearer (same sha256 -> token_hash lookup crm-api uses),
// so an agent can read and write this surface without a second endpoint.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const serviceClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

/** Admin session JWT, or a valid api_tokens bearer. */
async function authorize(req: Request, sb: ReturnType<typeof serviceClient>): Promise<true | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = auth.slice(7).trim();

  // Path 1: machine token.
  const hash = await sha256(token);
  const { data: tokenRow } = await sb
    .from("api_tokens").select("id, revoked").eq("token_hash", hash).maybeSingle();
  if (tokenRow && !tokenRow.revoked) {
    sb.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id).then(() => {});
    return true;
  }

  // Path 2: admin session JWT.
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) return json({ error: "Unauthorized" }, 401);
  const { data: admin } = await sb.from("admin_users").select("id").eq("user_id", data.user.id).maybeSingle();
  if (!admin) return json({ error: "Forbidden" }, 403);
  return true;
}

// ---------- schemas ----------
const FunnelStage = z.object({ key: z.string().min(1).max(40), label: z.string().min(1).max(120) });

const VentureInput = z.object({
  slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(160),
  kind: z.enum(["training", "newsletter", "community", "other"]).default("other"),
  status: z.enum(["active", "paused", "archived"]).optional(),
  currency: z.string().length(3).optional(),
  description: z.string().max(2000).nullish(),
  brand_color: z.string().max(32).nullish(),
  platform: z.enum(["stripe", "substack", "skool", "manual"]).nullish(),
  platform_account_ref: z.string().max(200).nullish(),
  funnel_stages: z.array(FunnelStage).optional(),
  goal_mrr_cents: z.number().int().nullish(),
  goal_members: z.number().int().nullish(),
});

const LaunchInput = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  status: z.enum(["planned", "open", "running", "complete", "canceled"]).optional(),
  cart_open_at: z.string().datetime().nullish(),
  cart_close_at: z.string().datetime().nullish(),
  starts_at: z.string().datetime().nullish(),
  ends_at: z.string().datetime().nullish(),
  ticket_price_cents: z.number().int().nullish(),
  goal_revenue_cents: z.number().int().nullish(),
  goal_signups: z.number().int().nullish(),
  notes: z.string().max(4000).nullish(),
});

const RevenueInput = z.object({
  launch_id: z.string().uuid().nullish(),
  occurred_at: z.string().datetime(),
  amount_cents: z.number().int(),
  currency: z.string().length(3).optional(),
  kind: z.enum(["sale", "subscription", "payout", "refund", "adjustment"]).default("sale"),
  external_id: z.string().max(200).nullish(),
  customer_email: z.string().email().max(254).nullish(),
  customer_name: z.string().max(200).nullish(),
  description: z.string().max(1000).nullish(),
});

// One save writes every metric for a day. Upserts on (venture_id, metric_key,
// captured_on), so re-entering a day corrects it instead of duplicating.
const SnapshotInput = z.object({
  captured_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  metrics: z.record(z.string().min(1).max(60), z.number()),
  notes: z.string().max(1000).nullish(),
  // 'import' means at least one value was read off a screenshot rather than
  // typed, so a suspect figure can be traced back later.
  source: z.enum(["manual", "import"]).default("manual"),
});

const DAY = 86_400_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = serviceClient();
  const guard = await authorize(req, sb);
  if (guard instanceof Response) return guard;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/ventures-api\/?/, "/").replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  const method = req.method;

  const readBody = async () => {
    try { return await req.json(); } catch { return null; }
  };

  try {
    // ==================== /ventures ====================
    if (parts[0] === "ventures" && parts.length === 1) {
      if (method === "GET") {
        const { data, error } = await sb.from("ventures").select("*")
          .neq("status", "archived").order("created_at", { ascending: true });
        if (error) return json({ error: error.message }, 500);

        // Roster needs 30d cash + latest levels per venture, in two queries not N.
        const since = new Date(Date.now() - 30 * DAY).toISOString();
        const [{ data: cash }, { data: snaps }] = await Promise.all([
          sb.from("revenue_entries").select("venture_id, amount_cents").gte("occurred_at", since),
          sb.from("latest_metric_snapshots_v").select("venture_id, metric_key, value, captured_on"),
        ]);

        const cash30: Record<string, number> = {};
        for (const r of cash ?? []) cash30[r.venture_id] = (cash30[r.venture_id] ?? 0) + (r.amount_cents ?? 0);

        // The view already returns one row per (venture, metric).
        const latest: Record<string, Record<string, number>> = {};
        for (const s of snaps ?? []) {
          (latest[s.venture_id] ??= {})[s.metric_key] = Number(s.value);
        }

        return json({
          ventures: (data ?? []).map((v) => ({
            ...v,
            cash_30d_cents: cash30[v.id] ?? 0,
            latest_metrics: latest[v.id] ?? {},
          })),
        });
      }
      if (method === "POST") {
        const parsed = VentureInput.safeParse(await readBody());
        if (!parsed.success) return json({ error: "Invalid venture", details: parsed.error.flatten() }, 400);
        const ingestKey = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
        const { data, error } = await sb.from("ventures")
          .insert({ ...parsed.data, public_ingest_key: ingestKey }).select().single();
        if (error) {
          const dup = error.code === "23505" || /duplicate key/i.test(error.message);
          return json(
            { error: dup ? `A venture with the slug "${parsed.data.slug}" already exists. Pick a different name or slug.` : error.message },
            dup ? 409 : 400,
          );
        }
        return json({ venture: data }, 201);
      }
    }

    // ==================== /ventures/:id ====================
    if (parts[0] === "ventures" && parts.length === 2) {
      const id = parts[1];
      if (method === "GET") {
        const { data, error } = await sb.from("ventures").select("*").eq("id", id).maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "Not found" }, 404);
        return json({ venture: data });
      }
      if (method === "PATCH") {
        const parsed = VentureInput.partial().safeParse(await readBody());
        if (!parsed.success) return json({ error: "Invalid venture", details: parsed.error.flatten() }, 400);
        const { data, error } = await sb.from("ventures").update(parsed.data).eq("id", id).select().single();
        if (error) return json({ error: error.message }, 400);
        return json({ venture: data });
      }
      if (method === "DELETE") {
        // Archive rather than destroy — revenue history must survive.
        const { error } = await sb.from("ventures").update({ status: "archived" }).eq("id", id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
    }

    // ==================== /ventures/:id/launches ====================
    if (parts[0] === "ventures" && parts[2] === "launches" && parts.length === 3) {
      const ventureId = parts[1];
      if (method === "GET") {
        const { data, error } = await sb.from("venture_launches").select("*")
          .eq("venture_id", ventureId).order("starts_at", { ascending: false, nullsFirst: false });
        if (error) return json({ error: error.message }, 500);
        return json({ launches: data ?? [] });
      }
      if (method === "POST") {
        const parsed = LaunchInput.safeParse(await readBody());
        if (!parsed.success) return json({ error: "Invalid launch", details: parsed.error.flatten() }, 400);
        const { data, error } = await sb.from("venture_launches")
          .insert({ ...parsed.data, venture_id: ventureId }).select().single();
        if (error) return json({ error: error.message }, 400);

        // Seed this cohort's checklist from the venture template, dating each
        // item off the launch start so due dates are real, not decorative.
        const { data: tpl } = await sb.from("launch_checklist_templates")
          .select("*").eq("venture_id", ventureId).order("order_index");
        if (tpl?.length) {
          const base = data.starts_at ? new Date(data.starts_at) : null;
          await sb.from("launch_checklist_items").insert(tpl.map((t) => ({
            launch_id: data.id,
            template_id: t.id,
            key: t.key,
            label: t.label,
            order_index: t.order_index,
            checklist: t.checklist,
            due_date: base && t.offset_days != null
              ? new Date(base.getTime() + t.offset_days * DAY).toISOString().slice(0, 10)
              : null,
          })));
        }
        return json({ launch: data }, 201);
      }
    }

    // ==================== /launches/:id ====================
    if (parts[0] === "launches" && parts.length === 2) {
      const id = parts[1];
      if (method === "GET") {
        const [{ data: launch }, { data: items }, { data: revenue }] = await Promise.all([
          sb.from("venture_launches").select("*").eq("id", id).maybeSingle(),
          sb.from("launch_checklist_items").select("*").eq("launch_id", id).order("order_index"),
          sb.from("revenue_entries").select("*").eq("launch_id", id).order("occurred_at", { ascending: false }),
        ]);
        if (!launch) return json({ error: "Not found" }, 404);

        const { data: events } = await sb.from("funnel_events").select("stage, anon_id").eq("launch_id", id);
        const funnel: Record<string, number> = {};
        for (const e of events ?? []) funnel[e.stage] = (funnel[e.stage] ?? 0) + 1;

        return json({
          launch,
          checklist: items ?? [],
          revenue: revenue ?? [],
          // Actuals are always computed, never stored, so they cannot go stale.
          actual_revenue_cents: (revenue ?? []).reduce((s, r) => s + (r.amount_cents ?? 0), 0),
          actual_signups: (revenue ?? []).filter((r) => r.kind === "sale").length,
          funnel,
        });
      }
      if (method === "PATCH") {
        const parsed = LaunchInput.partial().safeParse(await readBody());
        if (!parsed.success) return json({ error: "Invalid launch", details: parsed.error.flatten() }, 400);
        const { data, error } = await sb.from("venture_launches").update(parsed.data).eq("id", id).select().single();
        if (error) return json({ error: error.message }, 400);
        return json({ launch: data });
      }
      if (method === "DELETE") {
        const { error } = await sb.from("venture_launches").delete().eq("id", id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }
    }

    // ==================== /checklist-items/:id ====================
    if (parts[0] === "checklist-items" && parts.length === 2) {
      if (method === "PATCH") {
        const parsed = z.object({
          status: z.enum(["pending", "in_progress", "complete", "skipped"]).optional(),
          due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
          notes: z.string().max(4000).nullish(),
          checklist: z.array(z.any()).optional(),
        }).safeParse(await readBody());
        if (!parsed.success) return json({ error: "Invalid item", details: parsed.error.flatten() }, 400);
        const patch: Record<string, unknown> = { ...parsed.data };
        if (parsed.data.status) {
          patch.completed_at = parsed.data.status === "complete" ? new Date().toISOString() : null;
        }
        const { data, error } = await sb.from("launch_checklist_items")
          .update(patch).eq("id", parts[1]).select().single();
        if (error) return json({ error: error.message }, 400);
        return json({ item: data });
      }
    }

    // ==================== /ventures/:id/revenue ====================
    if (parts[0] === "ventures" && parts[2] === "revenue" && parts.length === 3) {
      const ventureId = parts[1];
      if (method === "GET") {
        const { data, error } = await sb.from("revenue_entries").select("*")
          .eq("venture_id", ventureId).order("occurred_at", { ascending: false }).limit(200);
        if (error) return json({ error: error.message }, 500);
        return json({ entries: data ?? [] });
      }
      if (method === "POST") {
        const parsed = RevenueInput.safeParse(await readBody());
        if (!parsed.success) return json({ error: "Invalid entry", details: parsed.error.flatten() }, 400);
        const { data, error } = await sb.from("revenue_entries")
          .insert({ ...parsed.data, venture_id: ventureId, source: "manual" }).select().single();
        if (error) return json({ error: error.message }, 400);
        await sb.from("activity_events").insert({
          kind: "venture_revenue",
          title: `${(parsed.data.amount_cents / 100).toFixed(2)} recorded`,
          description: parsed.data.description ?? null,
          venture_id: ventureId,
          venture_launch_id: parsed.data.launch_id ?? null,
          actor: "admin",
        });
        return json({ entry: data }, 201);
      }
    }

    if (parts[0] === "revenue" && parts.length === 2 && method === "DELETE") {
      const { error } = await sb.from("revenue_entries").delete().eq("id", parts[1]);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // ==================== /ventures/:id/snapshots ====================
    if (parts[0] === "ventures" && parts[2] === "snapshots" && parts.length === 3) {
      const ventureId = parts[1];
      if (method === "GET") {
        const days = Math.min(Number(url.searchParams.get("days") ?? 180), 730);
        const from = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
        const { data, error } = await sb.from("metric_snapshots").select("*")
          .eq("venture_id", ventureId).gte("captured_on", from)
          .order("captured_on", { ascending: true });
        if (error) return json({ error: error.message }, 500);
        return json({ snapshots: data ?? [] });
      }
      if (method === "POST") {
        const parsed = SnapshotInput.safeParse(await readBody());
        if (!parsed.success) return json({ error: "Invalid snapshot", details: parsed.error.flatten() }, 400);
        const rows = Object.entries(parsed.data.metrics).map(([metric_key, value]) => ({
          venture_id: ventureId,
          captured_on: parsed.data.captured_on,
          metric_key,
          value,
          source: parsed.data.source,
          notes: parsed.data.notes ?? null,
        }));
        if (!rows.length) return json({ error: "No metrics supplied" }, 400);
        const { data, error } = await sb.from("metric_snapshots")
          .upsert(rows, { onConflict: "venture_id,metric_key,captured_on" }).select();
        if (error) return json({ error: error.message }, 400);
        await sb.from("activity_events").insert({
          kind: "metric_snapshot",
          title: `Numbers logged for ${parsed.data.captured_on}`,
          description: rows.map((r) => `${r.metric_key}: ${r.value}`).join(", "),
          venture_id: ventureId,
          actor: "admin",
        });
        return json({ snapshots: data ?? [] }, 201);
      }
    }

    // ==================== /ventures/:id/analytics ====================
    if (parts[0] === "ventures" && parts[2] === "analytics" && parts.length === 3) {
      const ventureId = parts[1];
      const days = Math.min(Number(url.searchParams.get("days") ?? 180), 730);
      const sinceIso = new Date(Date.now() - days * DAY).toISOString();

      const [{ data: venture }, { data: entries }, { data: snaps }, { data: events }, { data: launches }] =
        await Promise.all([
          sb.from("ventures").select("*").eq("id", ventureId).maybeSingle(),
          sb.from("revenue_entries").select("occurred_at, amount_cents, kind")
            .eq("venture_id", ventureId).gte("occurred_at", sinceIso),
          sb.from("metric_snapshots").select("metric_key, value, captured_on")
            .eq("venture_id", ventureId).order("captured_on", { ascending: true }),
          sb.from("funnel_events").select("stage, occurred_at").eq("venture_id", ventureId).gte("occurred_at", sinceIso),
          sb.from("venture_launches").select("*").eq("venture_id", ventureId)
            .order("starts_at", { ascending: false, nullsFirst: false }).limit(12),
        ]);
      if (!venture) return json({ error: "Not found" }, 404);

      const monthly: Record<string, number> = {};
      for (const e of entries ?? []) {
        const m = e.occurred_at.slice(0, 7);
        monthly[m] = (monthly[m] ?? 0) + (e.amount_cents ?? 0);
      }

      const series: Record<string, Array<{ date: string; value: number }>> = {};
      for (const s of snaps ?? []) {
        (series[s.metric_key] ??= []).push({ date: s.captured_on, value: Number(s.value) });
      }
      const latest_metrics: Record<string, number> = {};
      for (const [k, pts] of Object.entries(series)) latest_metrics[k] = pts[pts.length - 1]?.value ?? 0;

      const funnel: Record<string, number> = {};
      for (const e of events ?? []) funnel[e.stage] = (funnel[e.stage] ?? 0) + 1;

      const since30 = Date.now() - 30 * DAY;
      return json({
        venture,
        // Cash and levels are returned under separate keys and are never added
        // together anywhere in the UI. MRR is a run-rate, not collected money.
        cash: {
          total_cents: (entries ?? []).reduce((s, e) => s + (e.amount_cents ?? 0), 0),
          last_30d_cents: (entries ?? [])
            .filter((e) => new Date(e.occurred_at).getTime() >= since30)
            .reduce((s, e) => s + (e.amount_cents ?? 0), 0),
          monthly: Object.entries(monthly).sort().map(([month, cents]) => ({ month, cents })),
        },
        levels: { latest: latest_metrics, series },
        funnel: {
          stages: venture.funnel_stages ?? [],
          counts: funnel,
        },
        launches: launches ?? [],
      });
    }

    return json({ error: "Not found", path }, 404);
  } catch (e) {
    console.error("ventures-api error", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
