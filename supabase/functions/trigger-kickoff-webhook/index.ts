// Sends the SureContact "Kickoff Confirmation" template via the public API
// (POST /api/v1/public/emails/send) the moment all intake checklist items
// EXCEPT `intake.kickoff_confirmation_sent` are done. Stamps
// `clients.kickoff_webhook_fired_at` to enforce idempotency, logs the send to
// `email_send_log`, and flips the kickoff checklist item — which the existing
// `auto_complete_journey_node` trigger then uses to close Node 1 + advance
// Node 2.
//
// verify_jwt = false — invoked by the DB trigger via pg_net and by the admin
// UI for manual re-fires.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { splitContactName, upsertSureContact } from "../_shared/surecontact.ts";

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

const SURECONTACT_SEND_URL =
  "https://api.surecontact.com/api/v1/public/emails/send";

const PORTAL_BASE_URL =
  Deno.env.get("PORTAL_BASE_URL") || "https://cre8visions.com";

const KICKOFF_ITEM_KEY = "intake.kickoff_confirmation_sent";

interface ChecklistItem {
  key?: string;
  done?: boolean;
  done_at?: string | null;
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

function markKickoffDone(checklist: unknown): ChecklistItem[] | null {
  if (!Array.isArray(checklist)) return null;
  const next = (checklist as ChecklistItem[]).map((it) => {
    if (it && typeof it === "object" && it.key === KICKOFF_ITEM_KEY) {
      return { ...it, done: true, done_at: new Date().toISOString() };
    }
    return it;
  });
  return next;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const apiKey = Deno.env.get("SURECONTACT_API_KEY");
    const templateUuid = Deno.env.get("SURECONTACT_KICKOFF_TEMPLATE_UUID");
    if (!apiKey) return json({ success: false, error: "SURECONTACT_API_KEY not configured" }, 500);
    if (!templateUuid) {
      return json({
        success: false,
        error: "SURECONTACT_KICKOFF_TEMPLATE_UUID not configured",
      }, 500);
    }

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

    // 1) Upsert contact so SureContact has an up-to-date record + custom fields
    //    available to the template's merge tags.
    const upsert = await upsertSureContact(
      {
        email: client.contact_email,
        firstName,
        lastName,
        company: client.business_name ?? "",
        phone: client.contact_phone ?? "",
        customFields: {
          client_id: clientId,
          portal_url: portalUrl,
          tier: tierLabel,
        },
        metadata: { form_source: "cre8visions_crm", trigger: "kickoff_confirmation" },
      },
      apiKey,
    );

    if (!upsert.ok) {
      await supabase.from("email_send_log").insert({
        template_name: "kickoff-confirmation",
        recipient_email: client.contact_email,
        status: "failed",
        error_message: `Upsert failed (${upsert.status}): ${upsert.error ?? "unknown"}`,
        metadata: { client_id: clientId, stage: "upsert", surecontact: upsert.data },
      });
      return json({
        success: false,
        error: upsert.error ?? `SureContact upsert returned ${upsert.status}`,
      }, 502);
    }

    // 2) Send the kickoff template via the public emails API.
    const sendPayload = {
      contact_email: client.contact_email,
      template_uuid: templateUuid,
    };

    let sendStatus = 0;
    let sendResponse: unknown = null;
    try {
      const resp = await fetch(SURECONTACT_SEND_URL, {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(sendPayload),
      });
      sendStatus = resp.status;
      try { sendResponse = await resp.json(); }
      catch { sendResponse = await resp.text().catch(() => null); }

      if (!resp.ok) {
        await supabase.from("email_send_log").insert({
          template_name: "kickoff-confirmation",
          recipient_email: client.contact_email,
          status: "failed",
          error_message: `SureContact /emails/send returned ${resp.status}`,
          metadata: {
            client_id: clientId,
            stage: "send",
            send_status: resp.status,
            send_response: sendResponse,
            payload: sendPayload,
          },
        });
        return json({
          success: false,
          error: `SureContact /emails/send returned ${resp.status}`,
          surecontact: sendResponse,
        }, 502);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      await supabase.from("email_send_log").insert({
        template_name: "kickoff-confirmation",
        recipient_email: client.contact_email,
        status: "failed",
        error_message: msg,
        metadata: { client_id: clientId, stage: "send" },
      });
      return json({ success: false, error: msg }, 502);
    }

    // 3) Stamp idempotency marker on the client.
    await supabase
      .from("clients")
      .update({ kickoff_webhook_fired_at: new Date().toISOString() })
      .eq("id", clientId);

    // 4) Log success.
    await supabase.from("email_send_log").insert({
      template_name: "kickoff-confirmation",
      recipient_email: client.contact_email,
      status: "api_triggered",
      metadata: {
        client_id: clientId,
        send_status: sendStatus,
        send_response: sendResponse,
        template_uuid: templateUuid,
        payload: sendPayload,
      },
    });

    // 5) Flip the kickoff checklist item — `auto_complete_journey_node` will
    //    then mark the intake node complete and advance to the next node.
    const nextChecklist = markKickoffDone(intakeNode.checklist);
    if (nextChecklist) {
      const { error: updErr } = await supabase
        .from("journey_nodes")
        .update({ checklist: nextChecklist })
        .eq("id", intakeNode.id);
      if (updErr) {
        console.warn("[trigger-kickoff-webhook] failed to flip kickoff item", updErr);
      }
    }

    return json({
      success: true,
      fired: true,
      surecontact: sendResponse,
    });
  } catch (e) {
    console.error("[trigger-kickoff-webhook] error", e);
    return json({ success: false, error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
