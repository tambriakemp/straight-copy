// Generates a complete brand voice document from an intake summary using Claude
// and saves it onto the matching public.clients row.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

function asList(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "string") return v;
  return "Not provided";
}
function asText(v: unknown, fallback = "Not provided"): string {
  return typeof v === "string" && v.trim() ? v : fallback;
}

function buildBrandVoicePrompt(intake: Record<string, unknown>): string {
  return `You are building a brand voice document for a small business.
This document configures an AI assistant that will write all content for this business.
It must be specific, nuanced, and immediately usable — not generic.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CLIENT INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Business: ${asText(intake.business || intake.business_name)}
Owner: ${asText(intake.name || intake.contact_name)}
What they do: ${asText(intake.what_they_do)}
Primary offer: ${asText(intake.primary_offer)}
Price point: ${asText(intake.price_point)}

Ideal customer: ${asText(intake.ideal_customer)}
Customer struggles: ${asText(intake.customer_struggles)}
Customer desired outcome: ${asText(intake.customer_outcome)}

Tone words: ${asList(intake.tone_words)}
Natural phrases they use: ${asList(intake.natural_phrases)}
Words/phrases to NEVER use: ${asList(intake.avoid_words)}

Sample writing (how they naturally talk):
${asText(intake.sample_writing, "See conversation context above")}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT TO GENERATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate a complete brand voice document with these exact sections:

## 1. BRAND PERSONALITY
3–5 personality descriptors. For each: the word/phrase, one sentence on what it means for THIS brand, one sentence on what it explicitly is NOT. No generic adjectives.

## 2. TONE & VOICE
- Emotional register (what readers should feel)
- Formal vs casual positioning, with a specific example
- Energy (fast/punchy or slow/considered?)
- How they open and close
- How vulnerability and authority balance

## 3. LANGUAGE RULES
- 5+ phrases or words they use naturally (with example context)
- 5+ phrases or words they never use (explain why each is off-brand)
- Sentence structure tendencies
- Punctuation style
- Emoji guidelines

## 4. HOW TO WRITE FOR THIS BRAND
- How to open an email or caption
- How to close a CTA
- How to write about the customer's problem
- How to write about the offer
- How they handle confidence vs humility
- What this brand never does in writing

## 5. IDEAL CUSTOMER REFERENCE
One paragraph in second person addressing the ideal customer. Start with "You are…". Usable verbatim in their content.

## 6. SAMPLE SENTENCES
1. A caption hook
2. An email opener
3. A call-to-action
4. A product/offer description line
5. A reply to a client compliment

## 7. QUICK REFERENCE CARD
A 150–200 word paragraph that works as a system prompt. Start with: "You are writing as [Business Name]. Your voice is..." Wrap it in markers exactly:
--- QUICK REFERENCE CARD (copy this into Claude Project) ---
[the paragraph]
--- END QUICK REFERENCE CARD ---

QUALITY STANDARDS:
- Every example must be specific to this business and customer
- No generic phrases that could apply to any brand
- Format cleanly with markdown headers`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  let clientId: string | undefined;

  try {
    const body = await req.json();
    clientId = body.clientId;
    let summary: Record<string, unknown> | undefined = body.summary;

    if (!clientId) {
      return new Response(JSON.stringify({ error: "clientId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    // Pull intake_data from the row if not supplied.
    if (!summary) {
      const { data: row } = await supabase
        .from("clients")
        .select("intake_data")
        .eq("id", clientId)
        .maybeSingle();
      summary = (row?.intake_data as Record<string, unknown>) || {};
    }

    await supabase
      .from("clients")
      .update({
        brand_voice_status: "in_progress",
        brand_voice_started_at: new Date().toISOString(),
        pipeline_stage: "brand_voice_generating",
      })
      .eq("id", clientId);

    const prompt = buildBrandVoicePrompt(summary);

    const claudeResp = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!claudeResp.ok) {
      const txt = await claudeResp.text().catch(() => "");
      throw new Error(`Claude API ${claudeResp.status}: ${txt.slice(0, 500)}`);
    }

    const claudeData = await claudeResp.json();
    const brandVoiceDoc: string | undefined = claudeData.content?.[0]?.text;
    if (!brandVoiceDoc) throw new Error("Claude returned empty response");

    const qrcMatch = brandVoiceDoc.match(
      /--- QUICK REFERENCE CARD[\s\S]*?---([\s\S]*?)--- END QUICK REFERENCE CARD ---/,
    );
    const quickRef = qrcMatch ? qrcMatch[1].trim() : null;

    const { error: updErr } = await supabase
      .from("clients")
      .update({
        brand_voice_doc: brandVoiceDoc,
        brand_voice_quick_ref: quickRef,
        brand_voice_status: "complete",
        brand_voice_generated_at: new Date().toISOString(),
        pipeline_stage: "brand_voice_complete",
      })
      .eq("id", clientId);

    if (updErr) throw new Error(`DB update failed: ${updErr.message}`);

    // Mark the journey node complete (best-effort).
    await supabase
      .from("journey_nodes")
      .update({ status: "complete" })
      .eq("client_id", clientId)
      .eq("key", "brand_voice");

    return new Response(
      JSON.stringify({ success: true, clientId, hasQuickRef: !!quickRef }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[generate-brand-voice] error:", e);
    if (clientId) {
      try {
        await supabase
          .from("clients")
          .update({
            brand_voice_status: "failed",
            brand_voice_error: e instanceof Error ? e.message : String(e),
            pipeline_stage: "brand_voice_failed",
          })
          .eq("id", clientId);
      } catch { /* swallow */ }
    }
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
