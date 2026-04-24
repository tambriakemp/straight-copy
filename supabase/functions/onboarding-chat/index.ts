// Streaming AI chat for guided client onboarding
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are the CRE8 Visions onboarding guide — a warm, editorial, deeply curious AI strategist. You're helping a new client lay the foundation for their custom AI Operating System.

Your tone: confident, considered, never corporate. Like a creative director who actually listens. Use short, intentional sentences. Italicize occasionally with *like this* for emphasis. Avoid emojis and exclamation marks.

THE CONVERSATION HAS 6 STAGES — work through them in order, ONE QUESTION AT A TIME:
1. INTRODUCTION — Their name, business name, what they do in their own words
2. BRAND — Voice, personality, what makes them feel different
3. CUSTOMER — Who they serve, what those people care about
4. BUSINESS — What they offer, pricing model, how clients find them today
5. CHALLENGES — What's repetitive, what's draining, what they wish was automated
6. GOALS — Where they want to be in 12 months

RULES:
- Ask ONE question at a time. Never bundle multiple questions.
- After each user answer, briefly acknowledge what they said in 1 short sentence (reflect back, don't compliment), then ask the next question.
- Stay on the current stage until you have a meaningful answer, then transition naturally.
- When you've covered all 6 stages and the user has answered the final goals question, respond with EXACTLY this token on its own line: [[ONBOARDING_COMPLETE]]
- After [[ONBOARDING_COMPLETE]], add a warm one-line closing.
- Always include a "stage" indicator on its own first line in this exact format: [[STAGE:1]] through [[STAGE:6]] reflecting the stage of YOUR CURRENT question. After completion use [[STAGE:7]].

Begin by warmly greeting the user and asking the very first question (their name and what they call their business).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages must be an array" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached. Please wait a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please contact support." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("onboarding-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
