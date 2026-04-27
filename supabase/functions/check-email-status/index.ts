// Manual one-off email tracking refresh for a single client.
// Delegates to the scheduled `poll-email-status` function (which handles
// the SureContact API + checklist auto-flip + tracking upsert) and then
// returns the cached tracking row in the legacy shape that ClientDetail
// already understands.
//
// Admin-only (called from the Intake panel "Refresh" button).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

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

type EmailStatus = { sent: boolean; sent_at: string | null; opened: boolean };

const empty = (): EmailStatus => ({ sent: false, sent_at: null, opened: false });

interface TrackingRow {
  welcome_sent_at: string | null;  welcome_opened_at: string | null;
  scope_sent_at: string | null;    scope_opened_at: string | null;
  kickoff_sent_at: string | null;  kickoff_opened_at: string | null;
  day3_sent_at: string | null;     day3_opened_at: string | null;
  delivery_sent_at: string | null; delivery_opened_at: string | null;
  updated_at: string;
}

function statusFrom(sentAt: string | null, openedAt: string | null): EmailStatus {
  return { sent: !!sentAt, sent_at: sentAt, opened: !!openedAt };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth: must be a logged-in admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }
    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: userData.user.id });
    if (!isAdmin) return json({ success: false, error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const clientId = typeof body?.clientId === "string" ? body.clientId : null;
    if (!clientId) return json({ success: false, error: "clientId is required" }, 400);

    // Force a fresh poll for this client (bypasses cadence, respects pause/complete).
    const { error: pollErr } = await supabase.functions.invoke("poll-email-status", {
      body: { clientId },
    });
    if (pollErr) {
      console.warn("[check-email-status] poll-email-status invoke failed", pollErr);
      // Fall through and return whatever's cached.
    }

    const { data: tracking } = await supabase
      .from("client_email_tracking")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();

    const t = (tracking ?? null) as TrackingRow | null;

    return json({
      success: true,
      welcome_sent: t ? statusFrom(t.welcome_sent_at, t.welcome_opened_at) : empty(),
      scope_sent: t ? statusFrom(t.scope_sent_at, t.scope_opened_at) : empty(),
      kickoff_sent: t ? statusFrom(t.kickoff_sent_at, t.kickoff_opened_at) : empty(),
      day3_sent: t ? statusFrom(t.day3_sent_at, t.day3_opened_at) : empty(),
      delivery_sent: t ? statusFrom(t.delivery_sent_at, t.delivery_opened_at) : empty(),
      last_checked_at: t?.updated_at ?? null,
    });
  } catch (e) {
    console.error("[check-email-status] error", e);
    return json({ success: false, error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
