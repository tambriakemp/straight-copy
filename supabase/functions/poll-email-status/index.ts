// Scheduled SureContact email-activity sweeper.
//
// Invoked by pg_cron every 15 minutes. Finds clients that:
//   - aren't archived
//   - aren't subscription-canceled
//   - aren't manually paused
//   - haven't completed all 5 tracked emails (sent + opened)
//   - are due for their next poll based on a tiered cadence
//
// For each due client, fetches email_sent + email_opened activities from
// SureContact, upserts client_email_tracking, flips intake checklist items,
// and updates polling state (complete/paused as applicable).
//
// Also accepts { clientId } in the body for one-off manual runs (called by
// check-email-status).
//
// verify_jwt = false — cron + service-role admin path.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { flipChecklistItem } from "../_shared/auto-checklist.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SC_BASE = "https://api.surecontact.com/api/v1/public";

// Cap clients processed per run to keep the function under the timeout.
const MAX_PER_RUN = 25;

// How long after delivery_date to give up polling (in days).
const DELIVERY_WINDOW_DAYS = 14;

type EmailKey = "welcome" | "scope" | "kickoff" | "day3" | "delivery";

interface Matcher {
  key: EmailKey;
  phrase: string;
  intakeItemKey?: string;
}

const EMAIL_MATCHERS: Matcher[] = [
  { key: "welcome",  phrase: "welcome to cre8 visions",      intakeItemKey: "intake.welcome_email_sent" },
  { key: "scope",    phrase: "exactly what's included",      intakeItemKey: "intake.scope_summary_sent" },
  { key: "kickoff",  phrase: "build has officially started", intakeItemKey: "intake.kickoff_confirmation_sent" },
  { key: "day3",     phrase: "build update" },
  { key: "delivery", phrase: "your ai os is live" },
];

interface Activity {
  description?: string;
  created_at?: string;
  occurred_at?: string;
  timestamp?: string;
  type?: string;
}

function activityTime(a: Activity): string | null {
  return a.created_at ?? a.occurred_at ?? a.timestamp ?? null;
}

async function fetchActivities(
  uuid: string,
  apiKey: string,
  type: "email_sent" | "email_opened",
): Promise<Activity[]> {
  const url = `${SC_BASE}/contacts/${encodeURIComponent(uuid)}/activities?type=${type}`;
  try {
    const resp = await fetch(url, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      console.warn(`[poll-email-status] ${type} HTTP ${resp.status}`, txt.slice(0, 300));
      return [];
    }
    const data: any = await resp.json().catch(() => null);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.activities)) return data.activities;
    if (Array.isArray(data?.results)) return data.results;
    return [];
  } catch (e) {
    console.warn(`[poll-email-status] fetch ${type} threw`, e);
    return [];
  }
}

async function lookupContactUuidByEmail(
  email: string,
  apiKey: string,
): Promise<string | null> {
  const url = `${SC_BASE}/contacts/search?email=${encodeURIComponent(email)}`;
  try {
    const resp = await fetch(url, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
    });
    if (!resp.ok) return null;
    const data: any = await resp.json().catch(() => null);
    const candidates: any[] =
      (Array.isArray(data) && data) ||
      (Array.isArray(data?.data) && data.data) ||
      (Array.isArray(data?.contacts) && data.contacts) ||
      (Array.isArray(data?.results) && data.results) ||
      (data?.contact ? [data.contact] : []) ||
      (data && typeof data === "object" && (data.id || data.uuid) ? [data] : []);
    const first = candidates[0];
    if (!first) return null;
    return first.uuid ?? first.id ?? first.contact_id ?? null;
  } catch {
    return null;
  }
}

interface ClientRow {
  id: string;
  contact_email: string | null;
  surecontact_contact_uuid: string | null;
  created_at: string;
  delivery_date: string | null;
  email_tracking_last_polled_at: string | null;
}

/**
 * Tier cadence based on age since client.created_at:
 *   0–48h: every 2 hours
 *   48h+:  every 12 hours
 */
function isDueForPoll(c: ClientRow, now: Date): boolean {
  if (!c.email_tracking_last_polled_at) return true;
  const last = new Date(c.email_tracking_last_polled_at).getTime();
  const ageHours = (now.getTime() - new Date(c.created_at).getTime()) / 3_600_000;
  const intervalMs = ageHours <= 48
    ? 2 * 60 * 60 * 1000
    : 12 * 60 * 60 * 1000;
  return now.getTime() - last >= intervalMs;
}

interface PollOutcome {
  clientId: string;
  status: "polled" | "completed" | "paused" | "skipped" | "no_uuid" | "error";
  detail?: string;
}

async function pollOneClient(
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  c: ClientRow,
): Promise<PollOutcome> {
  // Resolve UUID
  let uuid = c.surecontact_contact_uuid;
  if (!uuid && c.contact_email) {
    uuid = await lookupContactUuidByEmail(c.contact_email, apiKey);
    if (uuid) {
      await supabase.from("clients").update({ surecontact_contact_uuid: uuid }).eq("id", c.id);
    }
  }

  if (!uuid) {
    await supabase
      .from("clients")
      .update({ email_tracking_last_polled_at: new Date().toISOString() })
      .eq("id", c.id);
    return { clientId: c.id, status: "no_uuid" };
  }

  const [sent, opened] = await Promise.all([
    fetchActivities(uuid, apiKey, "email_sent"),
    fetchActivities(uuid, apiKey, "email_opened"),
  ]);

  // Build the tracking row
  const tracking: Record<string, string | null> = {
    welcome_sent_at: null, welcome_opened_at: null,
    scope_sent_at: null, scope_opened_at: null,
    kickoff_sent_at: null, kickoff_opened_at: null,
    day3_sent_at: null, day3_opened_at: null,
    delivery_sent_at: null, delivery_opened_at: null,
  };

  let allSentAndOpened = true;

  for (const m of EMAIL_MATCHERS) {
    const phrase = m.phrase.toLowerCase();

    let bestSent: string | null = null;
    for (const a of sent) {
      const desc = (a.description ?? "").toLowerCase();
      if (!desc.includes(phrase)) continue;
      const t = activityTime(a);
      if (t && (!bestSent || t > bestSent)) bestSent = t;
    }

    let bestOpened: string | null = null;
    for (const a of opened) {
      const desc = (a.description ?? "").toLowerCase();
      if (!desc.includes(phrase)) continue;
      const t = activityTime(a);
      if (t && (!bestOpened || t > bestOpened)) bestOpened = t;
    }

    tracking[`${m.key}_sent_at`] = bestSent;
    tracking[`${m.key}_opened_at`] = bestOpened;

    if (!bestSent || !bestOpened) allSentAndOpened = false;

    // Auto-flip the matching intake checklist item
    if (bestSent && m.intakeItemKey) {
      try {
        await flipChecklistItem(supabase as any, c.id, "intake", m.intakeItemKey);
      } catch (e) {
        console.warn("[poll-email-status] flipChecklistItem failed", e);
      }
    }
  }

  // Bonus: welcome opened → flip intake.welcome_opened
  if (tracking.welcome_opened_at) {
    try {
      await flipChecklistItem(supabase as any, c.id, "intake", "intake.welcome_opened");
    } catch {/* ignore */}
  }

  // Upsert tracking
  await supabase
    .from("client_email_tracking")
    .upsert(
      { client_id: c.id, ...tracking, updated_at: new Date().toISOString() },
      { onConflict: "client_id" },
    );

  const now = new Date();
  const updates: Record<string, unknown> = {
    email_tracking_last_polled_at: now.toISOString(),
  };

  if (allSentAndOpened) {
    updates.email_tracking_complete_at = now.toISOString();
  } else if (c.delivery_date) {
    const deliveryMs = new Date(c.delivery_date).getTime();
    const ageDays = (now.getTime() - deliveryMs) / 86_400_000;
    if (ageDays > DELIVERY_WINDOW_DAYS) {
      updates.email_tracking_paused_at = now.toISOString();
      updates.email_tracking_paused_reason = "delivery_window_passed";
    }
  }

  await supabase.from("clients").update(updates).eq("id", c.id);

  if (updates.email_tracking_complete_at) return { clientId: c.id, status: "completed" };
  if (updates.email_tracking_paused_at) return { clientId: c.id, status: "paused" };
  return { clientId: c.id, status: "polled" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("SURECONTACT_API_KEY");
    if (!apiKey) return json({ success: false, error: "SURECONTACT_API_KEY not configured" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const singleClientId = typeof body?.clientId === "string" ? body.clientId : null;

    let candidates: ClientRow[] = [];

    if (singleClientId) {
      // Manual one-off run — bypass cadence but still respect pause/complete/archive.
      const { data, error } = await supabase
        .from("clients")
        .select("id, contact_email, surecontact_contact_uuid, created_at, delivery_date, email_tracking_last_polled_at, archived, email_tracking_complete_at, email_tracking_paused_at, subscription_status")
        .eq("id", singleClientId)
        .maybeSingle();
      if (error) return json({ success: false, error: error.message }, 500);
      if (!data) return json({ success: false, error: "Client not found" }, 404);
      if (data.archived) return json({ success: true, skipped: "archived" });
      if (data.subscription_status === "canceled") return json({ success: true, skipped: "subscription_canceled" });
      candidates = [data as ClientRow];
    } else {
      // Scheduled run — fetch eligible clients, then filter by cadence in JS.
      const { data, error } = await supabase
        .from("clients")
        .select("id, contact_email, surecontact_contact_uuid, created_at, delivery_date, email_tracking_last_polled_at, subscription_status")
        .eq("archived", false)
        .is("email_tracking_complete_at", null)
        .is("email_tracking_paused_at", null)
        .or("subscription_status.is.null,subscription_status.in.(active,trialing,past_due)")
        .order("email_tracking_last_polled_at", { ascending: true, nullsFirst: true })
        .limit(200);

      if (error) return json({ success: false, error: error.message }, 500);

      const now = new Date();
      candidates = ((data ?? []) as ClientRow[])
        .filter((c) => isDueForPoll(c, now))
        .slice(0, MAX_PER_RUN);
    }

    const counts = { scanned: candidates.length, polled: 0, completed: 0, paused: 0, no_uuid: 0, errors: 0 };
    const results: PollOutcome[] = [];

    for (const c of candidates) {
      try {
        const r = await pollOneClient(supabase, apiKey, c);
        results.push(r);
        if (r.status === "completed") counts.completed++;
        else if (r.status === "paused") counts.paused++;
        else if (r.status === "no_uuid") counts.no_uuid++;
        else if (r.status === "polled") counts.polled++;
      } catch (e) {
        counts.errors++;
        console.error("[poll-email-status] client failed", c.id, e);
        results.push({ clientId: c.id, status: "error", detail: e instanceof Error ? e.message : String(e) });
      }
    }

    return json({ success: true, ...counts, results });
  } catch (e) {
    console.error("[poll-email-status] fatal", e);
    return json({ success: false, error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
