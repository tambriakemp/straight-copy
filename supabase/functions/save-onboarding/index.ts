// Saves a completed onboarding submission and notifies the owner via email.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OWNER_EMAIL = "hello@cre8visions.com";
const CLAUDE_MODEL = "claude-sonnet-4-5";

const SUMMARY_SYSTEM = `You extract a structured summary from a client onboarding conversation for the CRE8 Visions team. Each value should be a concise 1-2 sentence summary based ONLY on what the user said. If a field wasn't covered, write "Not specified".`;

const SUMMARY_TOOL = {
  name: "extract_summary",
  description: "Extract a structured onboarding summary.",
  input_schema: {
    type: "object",
    properties: {
      contact_name: { type: ["string", "null"] },
      business_name: { type: ["string", "null"] },
      contact_email: { type: ["string", "null"] },
      what_they_do: { type: "string" },
      brand_voice: { type: "string" },
      ideal_customer: { type: "string" },
      offerings: { type: "string" },
      biggest_challenges: { type: "string" },
      goals_12_months: { type: "string" },
    },
    required: [
      "what_they_do",
      "brand_voice",
      "ideal_customer",
      "offerings",
      "biggest_challenges",
      "goals_12_months",
    ],
  },
};

async function extractSummaryWithClaude(transcript: string, apiKey: string): Promise<any> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      system: SUMMARY_SYSTEM,
      tools: [SUMMARY_TOOL],
      tool_choice: { type: "tool", name: "extract_summary" },
      messages: [{ role: "user", content: `Conversation:\n\n${transcript}` }],
    }),
  });
  if (!resp.ok) {
    console.error("Anthropic summary error:", resp.status, await resp.text().catch(() => ""));
    return {};
  }
  const j = await resp.json();
  const toolUse = (j.content || []).find((c: any) => c.type === "tool_use");
  return toolUse?.input ?? {};
}

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

    // 1. Use Claude to extract structured summary
    const transcript = conversation
      .map((m: any) => `${m.role === "user" ? "CLIENT" : "AI"}: ${m.content}`)
      .join("\n\n");

    const summary = await extractSummaryWithClaude(transcript, ANTHROPIC_API_KEY);

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
