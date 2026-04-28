// Fires the SureContact "kickoff confirmation" automation via an incoming
// webhook the moment all intake checklist items EXCEPT
// `intake.kickoff_confirmation_sent` are done. Stamps
// `clients.kickoff_webhook_fired_at` to enforce idempotency.
//
// After firing, kicks off `poll-email-status` immediately (and schedules
// short follow-up polls in the background) so that the kickoff "sent"
// activity flips the checklist item — and the existing
// `auto_complete_journey_node` trigger then closes Node 1 + advances Node 2.
//
// verify_jwt = false — invoked by the DB trigger via pg_net and by the
// admin UI for manual re-fires.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { splitContactName } from "../_shared/surecontact.ts";

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

const KICKOFF_WEBHOOK_URL =
  "https://api.surecontact.com/incoming-webhooks/89ce06f6-cd92-44a6-a8b2-31a01820fc1f";

const PORTAL_BASE_URL =
  Deno.env.get("PORTAL_BASE_URL") || "https://cre8visions.com";

const KICKOFF_ITEM_KEY = "intake.kickoff_confirmation_sent";

interface ChecklistItem {
  key?: string;
  done?: boolean;
}

function gatingMet(checklist: unknown): boolean {
  if (!Array.isArray(checklist)) return false;
  let nonKickoffTotal = 0;
  let nonKickoffDone = 0;
  let kickoffDone = false;
  for (const it of checklist as ChecklistItem[]) {
    if (!it || typeof it !== "object") continue;
    if (it.key === KICKOFF_ITEM_KEY) {
      kickoffDone = !!it.done;
      continue;
    }
    nonKickoffTotal++;
    if (it.done) nonKickoffDone++;
  }
  return nonKickoffTotal > 0 && nonKickoffDone === nonKickoffTotal && !kickoffDone;
}

async function schedulePollRetries(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
) {
  // Background fire-and-forget: poke poll-email-status now and again at
  // T+5min, T+10min, T+20min. The poller is idempotent.
  const delays = [0, 5 * 60_000, 10 * 60_000, 20 * 60_000];
  for (const ms of delays) {
    setTimeout(() => {
      supabase.functions
        .invoke("poll-email-status", { body: { clientId } })
        .catch((e) => console.warn("[trigger-kickoff-webhook] poll invoke failed", e));
    }, ms);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const clientId = typeof body?.clientId === "string" ? body.clientId : null;
    const force = body?.force === true;
    if (!clientId) return json({ success: false, error: "clientId is required" }, 400);

    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, business_name, contact_name, contact_email, contact_phone, tier, archived, kickoff_webhook_fired_at")
      .eq("id", clientId)
      .maybeSingle();

    if (clientErr) return json({ success: false, error: clientErr.message }, 500);
    if (!client) return json({ success: false, error: "Client not found" }, 404);
    if (client.archived) return json({ success: true, skipped: "archived" });
    if (!client.contact_email) {
      return json({ success: false, error: "Client has no contact_email" }, 400);
    }
    if (client.kickoff_webhook_fired_at && !force) {
      return json({ success: true, skipped: "already_fired", fired_at: client.kickoff_webhook_fired_at });
    }

    // Gating check (intake node)
    const { data: intakeNode } = await supabase
      .from("journey_nodes")
      .select("id, checklist")
      .eq("client_id", clientId)
      .eq("key", "intake")
      .maybeSingle();

    if (!intakeNode) return json({ success: false, error: "Intake node not found" }, 404);
    if (!force && !gatingMet(intakeNode.checklist)) {
      return json({
        success: false,
        skipped: "gating_not_met",
        error: "All intake items except kickoff confirmation must be checked off first",
      }, 409);
    }

    const { firstName, lastName } = splitContactName(client.contact_name);
    const portalUrl = `${PORTAL_BASE_URL.replace(/\/$/, "")}/portal/${clientId}`;
    const tierLabel = client.tier === "growth" ? "Growth" : "Launch";

    const payload = {
      email: client.contact_email,
      first_name: firstName,
      last_name: lastName,
      company: client.business_name ?? "",
      phone: client.contact_phone ?? "",
      client_id: clientId,
      portal_url: portalUrl,
      tier: tierLabel,
      trigger: "kickoff_confirmation",
    };

    let webhookResponse: unknown = null;
    let webhookStatus = 0;
    try {
      const resp = await fetch(KICKOFF_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      webhookStatus = resp.status;
      try { webhookResponse = await resp.json(); }
      catch { webhookResponse = await resp.text().catch(() => null); }

      if (!resp.ok) {
        await supabase.from("email_send_log").insert({
          template_name: "kickoff-confirmation",
          recipient_email: client.contact_email,
          status: "failed",
          error_message: `Webhook returned ${resp.status}`,
          metadata: { client_id: clientId, webhook_status: resp.status, webhook_response: webhookResponse },
        });
        return json({
          success: false,
          error: `SureContact webhook returned ${resp.status}`,
          surecontact: webhookResponse,
        }, 502);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      await supabase.from("email_send_log").insert({
        template_name: "kickoff-confirmation",
        recipient_email: client.contact_email,
        status: "failed",
        error_message: msg,
        metadata: { client_id: clientId },
      });
      return json({ success: false, error: msg }, 502);
    }

    // Stamp idempotency marker + log success
    await supabase
      .from("clients")
      .update({ kickoff_webhook_fired_at: new Date().toISOString() })
      .eq("id", clientId);

    await supabase.from("email_send_log").insert({
      template_name: "kickoff-confirmation",
      recipient_email: client.contact_email,
      status: "webhook_fired",
      metadata: { client_id: clientId, webhook_status: webhookStatus, payload },
    });

    // Schedule poller retries (fire-and-forget, won't block response)
    schedulePollRetries(supabase, clientId);

    return json({
      success: true,
      fired: true,
      surecontact: webhookResponse,
    });
  } catch (e) {
    console.error("[trigger-kickoff-webhook] error", e);
    return json({ success: false, error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
