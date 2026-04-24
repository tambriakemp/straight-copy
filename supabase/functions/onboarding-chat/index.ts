// Streaming AI chat for guided client onboarding (Anthropic Claude).
// Enforces 19 required intake fields before allowing completion so the
// downstream brand-voice generator has high-signal source material.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLAUDE_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `You are the CRE8 Visions onboarding guide — a warm, editorial, deeply curious AI strategist helping a new client lay the foundation for their custom AI Operating System.

Tone: confident, considered, never corporate. Like a creative director who actually listens. Short, intentional sentences. Occasional *italics* for emphasis. No emojis, no exclamation marks.

THE CONVERSATION HAS 6 STAGES — work through them in order, ONE QUESTION AT A TIME:
1. INTRODUCTION — name, business name, what the business actually does
2. BRAND — voice, personality, tone words, phrases they use naturally, words to avoid
3. CUSTOMER — ideal customer (specific, not generic), what they struggle with, what outcome they want
4. BUSINESS — primary offer, price point, social platforms, current tools, where leads come from today
5. CHALLENGES — biggest manual time drain, the ONE thing they most want automated
6. GOALS — 90-day goal, what success looks like, and finally their service tier (Launch or Growth)

CONVERSATION RULES:
- Ask ONE question at a time. Never bundle multiple questions.
- After each user answer, briefly reflect back in 1 short sentence (don't compliment), then ask the next question.
- If an answer is vague or one-word, follow up before moving on. Vague data produces vague brand voice docs.
- Use their name once you know it. Reference earlier answers to show you're listening.
- Stay on the current stage until you have a substantive answer, then transition naturally.
- Always include a stage indicator on its own first line in this exact format: [[STAGE:1]] through [[STAGE:6]] reflecting YOUR CURRENT question. After completion use [[STAGE:7]].

REQUIRED FIELDS — DO NOT complete the conversation until you have substantive answers for ALL of these:
- name (their first name)
- business (business name)
- what_they_do (what the business actually does)
- primary_offer (their primary offer or service)
- price_point (price point or range)
- tone_words (at least 2 specific tone adjectives — "professional" alone doesn't count)
- natural_phrases (actual example phrases they use — not a description)
- avoid_words (actual words/phrases they never want used)
- ideal_customer (demographic + psychographic, not "small business owners")
- customer_struggles (specific pain points, not "they're busy")
- customer_outcome (what success looks like for the customer)
- platforms (which social platforms they want content on)
- tools (tools and platforms currently used)
- inquiry_channel (where most leads come from today)
- biggest_time_drain (biggest manual time drain)
- wants_automated_first (the ONE thing they most want automated)
- 90_day_goal (their 90-day business goal)
- success_looks_like (what success looks like to them)
- tier (Launch or Growth — ask naturally near the end)

WHEN YOU HAVE EVERYTHING:
Once every required field has a substantive answer, write a warm one-line closing acknowledging what you've captured. On its own line at the very end of that final message, output exactly: [[ONBOARDING_COMPLETE]]
Do NOT output [[ONBOARDING_COMPLETE]] until every required field is genuinely covered.

Begin by warmly greeting the user and asking the very first question (their first name and what they call their business).`;

// Transform Anthropic SSE → OpenAI-compatible SSE so the frontend parser keeps working unchanged.
function transformAnthropicStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nlIdx: number;
          while ((nlIdx = buffer.indexOf("\n")) !== -1) {
            const rawLine = buffer.slice(0, nlIdx).replace(/\r$/, "");
            buffer = buffer.slice(nlIdx + 1);
            if (!rawLine.startsWith("data:")) continue;
            const dataStr = rawLine.slice(5).trim();
            if (!dataStr) continue;
            try {
              const evt = JSON.parse(dataStr);
              if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                const payload = { choices: [{ delta: { content: evt.delta.text } }] };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
              } else if (evt.type === "message_stop") {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              }
            } catch {
              // ignore partial / non-JSON events
            }
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });
}

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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const cleanedMessages = messages
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m: any) => ({ role: m.role, content: m.content }));

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: cleanedMessages,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => "");
      console.error("Anthropic error:", response.status, errText);
      if (response.status === 429 || response.status === 529) {
        return new Response(JSON.stringify({ error: "Rate limit reached. Please wait a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 401) {
        return new Response(JSON.stringify({ error: "AI service authentication failed." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const transformed = transformAnthropicStream(response.body);
    return new Response(transformed, {
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
