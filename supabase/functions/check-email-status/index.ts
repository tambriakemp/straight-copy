// Checks SureContact's activities log for a client and reports which campaign
// emails have been sent / opened. Auto-flips intake checklist items for
// matches. Admin-only.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { flipChecklistItem } from "../_shared/auto-checklist.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SC_BASE = "https://api.surecontact.com/api/v1/public";

// description-substring → result key + (optional) intake checklist key to flip
const EMAIL_MATCHERS: Array<{
  resultKey: "welcome_sent" | "scope_sent" | "kickoff_sent" | "day3_sent" | "delivery_sent";
  phrase: string;
  intakeItemKey?: string;
}> = [
  { resultKey: "welcome_sent",  phrase: "welcome to cre8 visions",      intakeItemKey: "intake.welcome_email_sent" },
  { resultKey: "scope_sent",    phrase: "exactly what's included",      intakeItemKey: "intake.scope_summary_sent" },
  { resultKey: "kickoff_sent",  phrase: "build has officially started", intakeItemKey: "intake.kickoff_confirmation_sent" },
  { resultKey: "day3_sent",     phrase: "build update" },
  { resultKey: "delivery_sent", phrase: "your ai os is live" },
];

type EmailStatus = { sent: boolean; sent_at: string | null; opened: boolean };

function emptyStatus(): EmailStatus {
  return { sent: false, sent_at: null, opened: false };
}

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
  const resp = await fetch(url, {
    headers: {
      "X-API-Key": apiKey,
      Accept: "application/json",
    },
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.warn(`[check-email-status] activities ${type} HTTP ${resp.status}`, txt.slice(0, 300));
    return [];
  }
  const data: any = await resp.json().catch(() => null);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.activities)) return data.activities;
  if (Array.isArray(data?.results)) return data.results;
  console.warn("[check-email-status] unexpected activities shape", JSON.stringify(data).slice(0, 300));
  return [];
}

/** Look up a SureContact contact UUID by email. Returns null on miss. */
async function lookupContactUuidByEmail(
  email: string,
  apiKey: string,
): Promise<string | null> {
  // SureContact public API: search by email
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
  } catch (e) {
    console.warn("[check-email-status] lookup by email failed", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("SURECONTACT_API_KEY");
    if (!apiKey) return json({ success: false, error: "SURECONTACT_API_KEY not configured" }, 500);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate caller is admin
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }
    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: claims.claims.sub });
    if (!isAdmin) return json({ success: false, error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const clientId = typeof body?.clientId === "string" ? body.clientId : null;
    if (!clientId) return json({ success: false, error: "clientId is required" }, 400);

    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, contact_email, surecontact_contact_uuid")
      .eq("id", clientId)
      .maybeSingle();

    if (clientErr) return json({ success: false, error: clientErr.message }, 500);
    if (!client) return json({ success: false, error: "Client not found" }, 404);

    // Resolve contact UUID
    let contactUuid = client.surecontact_contact_uuid as string | null;
    if (!contactUuid && client.contact_email) {
      contactUuid = await lookupContactUuidByEmail(client.contact_email, apiKey);
      if (contactUuid) {
        await supabase
          .from("clients")
          .update({ surecontact_contact_uuid: contactUuid })
          .eq("id", clientId);
      }
    }

    const result: Record<string, EmailStatus> = {
      welcome_sent: emptyStatus(),
      scope_sent: emptyStatus(),
      kickoff_sent: emptyStatus(),
      day3_sent: emptyStatus(),
      delivery_sent: emptyStatus(),
    };

    if (!contactUuid) {
      return json({ success: true, contact_uuid: null, ...result, note: "No SureContact UUID available for this client yet." });
    }

    const [sentActivities, openedActivities] = await Promise.all([
      fetchActivities(contactUuid, apiKey, "email_sent"),
      fetchActivities(contactUuid, apiKey, "email_opened"),
    ]);

    for (const matcher of EMAIL_MATCHERS) {
      const phrase = matcher.phrase.toLowerCase();

      // Most-recent sent activity matching phrase
      let bestSent: { time: string | null } | null = null;
      for (const a of sentActivities) {
        const desc = (a.description ?? "").toLowerCase();
        if (!desc.includes(phrase)) continue;
        const t = activityTime(a);
        if (!bestSent || (t && (!bestSent.time || t > bestSent.time))) {
          bestSent = { time: t };
        }
      }

      const opened = openedActivities.some((a) =>
        (a.description ?? "").toLowerCase().includes(phrase)
      );

      if (bestSent) {
        result[matcher.resultKey] = {
          sent: true,
          sent_at: bestSent.time,
          opened,
        };

        // Auto-check intake checklist item if mapped
        if (matcher.intakeItemKey) {
          await flipChecklistItem(supabase, clientId, "intake", matcher.intakeItemKey);
        }
      }
    }

    // Bonus: if welcome email was opened, also flip the intake.welcome_opened item
    if (result.welcome_sent.opened) {
      await flipChecklistItem(supabase, clientId, "intake", "intake.welcome_opened");
    }

    return json({ success: true, contact_uuid: contactUuid, ...result });
  } catch (e) {
    console.error("[check-email-status] error", e);
    return json(
      { success: false, error: e instanceof Error ? e.message : "Server error" },
      500,
    );
  }
});
