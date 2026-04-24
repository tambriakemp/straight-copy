// Saves a completed onboarding submission and notifies the owner via email.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OWNER_EMAIL = "hello@cre8visions.com";

const SUMMARY_SYSTEM = `You extract a structured summary from a client onboarding conversation for the CRE8 Visions team.
Return ONLY valid JSON, nothing else. Use this exact shape:
{
  "contact_name": "string or null",
  "business_name": "string or null",
  "contact_email": "string or null",
  "what_they_do": "string",
  "brand_voice": "string",
  "ideal_customer": "string",
  "offerings": "string",
  "biggest_challenges": "string",
  "goals_12_months": "string"
}
Each value should be a concise 1-2 sentence summary based ONLY on what the user said. If a field wasn't covered, write "Not specified".`;

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
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

    // 1. Use AI to extract structured summary
    const transcript = conversation
      .map((m: any) => `${m.role === "user" ? "CLIENT" : "AI"}: ${m.content}`)
      .join("\n\n");

    const summaryResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SUMMARY_SYSTEM },
          { role: "user", content: `Conversation:\n\n${transcript}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    let summary: any = {};
    if (summaryResp.ok) {
      const j = await summaryResp.json();
      try {
        summary = JSON.parse(j.choices?.[0]?.message?.content || "{}");
      } catch {
        summary = { raw: j.choices?.[0]?.message?.content };
      }
    } else {
      console.error("Summary AI failed:", await summaryResp.text());
    }

    // 2. Save to DB using service role
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: inserted, error: insertErr } = await supabase
      .from("onboarding_submissions")
      .insert({
        business_name: summary.business_name || null,
        contact_name: summary.contact_name || null,
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

    // 3. Notify owner via transactional email (fire-and-forget)
    try {
      await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "onboarding-notification",
          recipientEmail: OWNER_EMAIL,
          idempotencyKey: `onboarding-${inserted.id}`,
          templateData: {
            submissionId: inserted.id,
            businessName: summary.business_name || "Unknown",
            contactName: summary.contact_name || "Unknown",
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("save-onboarding error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
