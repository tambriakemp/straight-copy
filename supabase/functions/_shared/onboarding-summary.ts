// Shared summary-extraction tool schema + helpers used by both
// `save-onboarding` and `onboarding-session` so they stay in lockstep.
// Captures every field the brand-voice generator depends on.

export const SUMMARY_SYSTEM = `You extract a structured intake summary from a CRE8 Visions client onboarding conversation. Pull values ONLY from what the user actually said — never invent. For string-array fields, return an array of short specific items. If a field truly wasn't covered, return "Not specified" for strings, [] for arrays, or null for nullable fields.`;

export const SUMMARY_TOOL = {
  name: "extract_summary",
  description: "Extract a structured onboarding summary used to generate the client's brand voice document.",
  input_schema: {
    type: "object",
    properties: {
      // Contact
      name: { type: ["string", "null"], description: "Client's first name" },
      contact_name: { type: ["string", "null"], description: "Same as name; full display name if given" },
      business: { type: ["string", "null"], description: "Business name" },
      business_name: { type: ["string", "null"], description: "Business name (alias)" },
      contact_email: { type: ["string", "null"] },
      // Business
      what_they_do: { type: "string" },
      primary_offer: { type: "string" },
      price_point: { type: "string" },
      // Brand voice
      brand_voice: { type: "string", description: "1-2 sentence summary of overall brand voice and personality" },
      tone_words: { type: "array", items: { type: "string" } },
      natural_phrases: { type: "array", items: { type: "string" } },
      avoid_words: { type: "array", items: { type: "string" } },
      // Customer
      ideal_customer: { type: "string" },
      customer_struggles: { type: "string" },
      customer_outcome: { type: "string" },
      // Channels & ops
      platforms: { type: "array", items: { type: "string" } },
      tools: { type: "array", items: { type: "string" } },
      inquiry_channel: { type: "string" },
      // Pain & priorities
      biggest_time_drain: { type: "string" },
      wants_automated_first: { type: "string" },
      // Goals
      "90_day_goal": { type: "string" },
      success_looks_like: { type: "string" },
      // Tier
      tier: { type: "string", description: "Launch or Growth" },
      // Voice sample
      sample_writing: {
        type: "string",
        description: "3-4 sentences capturing how the client naturally talks, drawn from their own words",
      },
      // Back-compat with older summary card UI
      offerings: { type: "string" },
      biggest_challenges: { type: "string" },
      goals_12_months: { type: "string" },
    },
    required: [
      "what_they_do",
      "primary_offer",
      "price_point",
      "brand_voice",
      "tone_words",
      "ideal_customer",
      "customer_struggles",
      "customer_outcome",
      "platforms",
      "biggest_time_drain",
      "wants_automated_first",
      "90_day_goal",
      "success_looks_like",
      "tier",
    ],
  },
};

export async function extractSummaryWithClaude(transcript: string, apiKey: string): Promise<Record<string, unknown>> {
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 3000,
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
    const out = (toolUse?.input ?? {}) as Record<string, unknown>;

    // Normalize: ensure both "name"/"business" and "contact_name"/"business_name" populated.
    if (out.name && !out.contact_name) out.contact_name = out.name;
    if (out.contact_name && !out.name) out.name = out.contact_name;
    if (out.business && !out.business_name) out.business_name = out.business;
    if (out.business_name && !out.business) out.business = out.business_name;
    // Back-compat aliases for legacy summary card UI
    if (!out.offerings && out.primary_offer) out.offerings = out.primary_offer;
    if (!out.biggest_challenges && out.biggest_time_drain) out.biggest_challenges = out.biggest_time_drain;
    if (!out.goals_12_months && out["90_day_goal"]) out.goals_12_months = out["90_day_goal"];

    return out;
  } catch (e) {
    console.error("summary AI failed:", e);
    return {};
  }
}

// Best-effort: look up the client row created by the `create_client_from_onboarding`
// trigger and kick off brand-voice generation. Non-fatal on any error.
export async function triggerBrandVoiceGeneration(
  supabase: any,
  submissionId: string,
  summary: Record<string, unknown>,
  supabaseUrl: string,
  serviceKey: string,
) {
  try {
    // Wait briefly for the trigger to materialize the client row.
    let client: { id: string } | null = null;
    for (let i = 0; i < 6 && !client; i++) {
      const { data } = await supabase
        .from("clients")
        .select("id")
        .eq("onboarding_submission_id", submissionId)
        .maybeSingle();
      if (data) client = data;
      else await new Promise((r) => setTimeout(r, 250));
    }
    if (!client) {
      console.warn("[brand-voice trigger] no client row materialized for submission", submissionId);
      return;
    }

    // Stash structured intake data + flip status before invoking generator.
    await supabase
      .from("clients")
      .update({
        intake_data: summary,
        brand_voice_status: "in_progress",
        brand_voice_started_at: new Date().toISOString(),
        pipeline_stage: "brand_voice_generating",
      })
      .eq("id", client.id);

    // Fire-and-forget generator call (non-blocking).
    fetch(`${supabaseUrl}/functions/v1/generate-brand-voice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ clientId: client.id, summary }),
    }).catch((err) => console.error("brand-voice invoke failed:", err));
  } catch (e) {
    console.error("triggerBrandVoiceGeneration error (non-fatal):", e);
  }
}
