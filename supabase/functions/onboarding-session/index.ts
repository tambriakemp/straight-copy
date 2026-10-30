// Public edge function for invite resolution + auto-saving onboarding sessions.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { extractSummaryWithClaude, triggerBrandVoiceGeneration } from "../_shared/onboarding-summary.ts";
import { flipChecklistItem } from "../_shared/auto-checklist.ts";
import { InviteError, onboardingInviteSource } from "../_shared/onboarding-invite-source.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OWNER_EMAIL = "hello@cre8visions.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json();
    const { action, token } = body || {};

    if (!action || typeof action !== "string") return json({ error: "action required" }, 400);
    if (!token || typeof token !== "string") return json({ error: "token required" }, 400);

    // CRE-822, G6: the invite ENVELOPE (token, contact details, revoked,
    // expiry, completion) reads and writes through whichever source this
    // install answers from. `onboarding_submissions` -- the chat content
    // itself -- stays local on both, keyed by `invite_id`, which exists on
    // that table regardless of source and is therefore the one join this
    // function relies on rather than `onboarding_invites.submission_id`
    // (a column with no equivalent on the plugin).
    const inviteSource = onboardingInviteSource(supabase as never);
    let invite;
    try {
      invite = await inviteSource.redeemByToken(token);
    } catch (caught) {
      if (caught instanceof InviteError) {
        const status = caught.code === "not_found" ? 404 : caught.status === 409 ? 410 : caught.status;
        return json({ error: caught.message }, status);
      }
      console.error("invite lookup failed:", caught);
      return json({ error: "lookup failed" }, 500);
    }

    if (action === "resolve") {
      let conversation: unknown[] = [];
      let stage = 1;
      let completed = false;
      const { data: sub } = await supabase
        .from("onboarding_submissions")
        .select("conversation,completed,summary")
        .eq("invite_id", invite.id)
        .maybeSingle();
      if (sub) {
        conversation = Array.isArray(sub.conversation) ? sub.conversation : [];
        completed = sub.completed;
        stage = Math.min(7, Math.max(1, Math.ceil(conversation.length / 4)));
      }

      return json({
        invite: {
          contact_name: invite.contactName,
          contact_email: invite.contactEmail,
          business_name: invite.businessName,
        },
        conversation,
        stage,
        completed,
      });
    }

    if (action === "save") {
      const { conversation, stage } = body;
      if (!Array.isArray(conversation)) return json({ error: "conversation array required" }, 400);

      const now = new Date().toISOString();
      const { data: existingSub } = await supabase
        .from("onboarding_submissions")
        .select("id")
        .eq("invite_id", invite.id)
        .maybeSingle();
      let submissionId = existingSub?.id as string | undefined;

      if (!submissionId) {
        const { data: inserted, error: insErr } = await supabase
          .from("onboarding_submissions")
          .insert({
            conversation,
            completed: false,
            invite_id: invite.id,
            last_activity_at: now,
            contact_name: invite.contactName,
            contact_email: invite.contactEmail,
            business_name: invite.businessName,
          })
          .select()
          .single();
        if (insErr) {
          console.error("create submission failed:", insErr);
          return json({ error: "save failed" }, 500);
        }
        submissionId = inserted.id;
        // Only the admin-tables bridge has this column; the plugin has no
        // equivalent and does not need one -- `invite_id` above already
        // does this join's job on both sources.
        if (inviteSource.kind === "admin-tables") {
          await supabase
            .from("onboarding_invites")
            .update({ submission_id: submissionId })
            .eq("id", invite.id);
        }
      } else {
        const { error: updErr } = await supabase
          .from("onboarding_submissions")
          .update({ conversation, last_activity_at: now })
          .eq("id", submissionId);
        if (updErr) {
          console.error("update submission failed:", updErr);
          return json({ error: "save failed" }, 500);
        }
      }

      return json({ ok: true, submissionId, stage });
    }

    if (action === "complete") {
      const { conversation } = body;
      if (!Array.isArray(conversation) || conversation.length === 0) {
        return json({ error: "conversation required" }, 400);
      }

      const transcript = conversation
        .map((m: any) => `${m.role === "user" ? "CLIENT" : "AI"}: ${m.content}`)
        .join("\n\n");

      const summary: any = await extractSummaryWithClaude(transcript, ANTHROPIC_API_KEY);

      const { data: existingSub } = await supabase
        .from("onboarding_submissions")
        .select("id")
        .eq("invite_id", invite.id)
        .maybeSingle();
      let submissionId = existingSub?.id as string | undefined;
      if (!submissionId) {
        const { data: inserted, error: insErr } = await supabase
          .from("onboarding_submissions")
          .insert({
            conversation,
            completed: true,
            invite_id: invite.id,
            summary,
            business_name: summary.business_name || summary.business || invite.businessName,
            contact_name: summary.contact_name || summary.name || invite.contactName,
            contact_email: summary.contact_email || invite.contactEmail,
            last_activity_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (insErr) {
          console.error("complete insert failed:", insErr);
          return json({ error: "complete failed" }, 500);
        }
        submissionId = inserted.id;
      } else {
        const { error: updErr } = await supabase
          .from("onboarding_submissions")
          .update({
            conversation,
            summary,
            completed: true,
            business_name: summary.business_name || summary.business || invite.businessName,
            contact_name: summary.contact_name || summary.name || invite.contactName,
            contact_email: summary.contact_email || invite.contactEmail,
            last_activity_at: new Date().toISOString(),
          })
          .eq("id", submissionId);
        if (updErr) {
          console.error("complete update failed:", updErr);
          return json({ error: "complete failed" }, 500);
        }
      }

      // The create_client_from_onboarding DB trigger materializes the client
      // row + seeds journey_nodes synchronously on the write above, so it is
      // already there to look up -- same assumption the checklist flip below
      // always made, just read once and reused for both that and binding
      // this invite to the client it just produced.
      const { data: clientRow } = await supabase
        .from("clients")
        .select("id")
        .eq("onboarding_submission_id", submissionId)
        .maybeSingle();

      await inviteSource.complete(invite.id, {
        clientId: clientRow?.id ?? null,
        submissionRef: submissionId,
      }).catch((e) => console.error("invite complete failed (non-fatal):", e));

      // Flip `intake.onboarding_completed` on the client's intake node. The
      // auto_complete_journey_node trigger handles cascading node completion.
      try {
        if (clientRow?.id) {
          await flipChecklistItem(supabase as never, clientRow.id, "intake", "intake.onboarding_completed");
        }
      } catch (e) {
        console.error("flip onboarding_completed failed (non-fatal):", e);
      }

      // Kick off brand-voice generation against the client row the create_client_from_onboarding trigger materializes.
      triggerBrandVoiceGeneration(supabase, submissionId!, summary, SUPABASE_URL, SERVICE_KEY).catch(
        (e) => console.error("brand-voice trigger failed (non-fatal):", e),
      );

      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "onboarding-notification",
            recipientEmail: OWNER_EMAIL,
            idempotencyKey: `onboarding-${submissionId}`,
            templateData: {
              submissionId,
              businessName: summary.business_name || summary.business || invite.businessName || "Unknown",
              contactName: summary.contact_name || summary.name || invite.contactName || "Unknown",
              contactEmail: summary.contact_email || invite.contactEmail || "Not provided",
              summary,
            },
          },
        });
      } catch (e) {
        console.error("email notify failed (non-fatal):", e);
      }

      return json({ ok: true, id: submissionId, summary });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("onboarding-session error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
