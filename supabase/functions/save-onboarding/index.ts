// Saves a completed onboarding submission, notifies the owner via email,
// and kicks off brand-voice generation.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { extractSummaryWithClaude, triggerBrandVoiceGeneration } from "../_shared/onboarding-summary.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OWNER_EMAIL = "hello@cre8visions.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { conversation } = await req.json();
    if (!Array.isArray(conversation) || conversation.length === 0) {
      return new Response(JSON.stringify({ error: "conversation required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

    // 1. Use Claude to extract structured summary (19-field schema).
    const transcript = conversation
      .map((m: any) => `${m.role === "user" ? "CLIENT" : "AI"}: ${m.content}`)
      .join("\n\n");

    const summary: any = await extractSummaryWithClaude(transcript, ANTHROPIC_API_KEY);

    // 2. Save submission (the create_client_from_onboarding trigger will spawn a clients row).
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: inserted, error: insertErr } = await supabase
      .from("onboarding_submissions")
      .insert({
        business_name: summary.business_name || summary.business || null,
        contact_name: summary.contact_name || summary.name || null,
        contact_email: summary.contact_email || null,
        conversation,
        summary,
        completed: true,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Insert error:", insertErr);
      return new Response(JSON.stringify({ error: "Failed to save submission" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Kick off brand-voice generation against the client row the trigger just created.
    triggerBrandVoiceGeneration(supabase, inserted.id, summary, SUPABASE_URL, SERVICE_KEY).catch(
      (e) => console.error("brand-voice trigger failed (non-fatal):", e),
    );

    // 4. Notify owner via transactional email (fire-and-forget).
    try {
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "onboarding-notification",
          recipientEmail: OWNER_EMAIL,
          idempotencyKey: `onboarding-${inserted.id}`,
          templateData: {
            submissionId: inserted.id,
            businessName: summary.business_name || summary.business || "Unknown",
            contactName: summary.contact_name || summary.name || "Unknown",
            contactEmail: summary.contact_email || "Not provided",
            summary,
          },
        },
      });
    } catch (e) {
      console.error("Email notification failed (non-fatal):", e);
    }

    return new Response(
      JSON.stringify({ success: true, id: inserted.id, summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("save-onboarding error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
