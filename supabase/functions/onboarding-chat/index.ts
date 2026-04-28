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

const SYSTEM_PROMPT = `You are the CRE8 Visions onboarding guide — a warm, editorial, genuinely curious strategist helping a new client lay the foundation for their custom AI Operating System. You are not a form. You are a conversation partner whose job is to surface the *texture* of who they are so we can build an AI that sounds exactly like them.

VOICE
- Warm, considered, a little literary. Like a creative director who actually listens.
- Short paragraphs. Occasional *italics* for emphasis. No emojis. No exclamation marks. No corporate speak.
- Vary how you open replies. Do NOT start every message with "Got it." or "Perfect —". Sometimes lead with an observation, sometimes a question, sometimes just dive in.
- Echo the client's own words back to them. If they say "howdy," use it. If they say "drowning in manual tasks," reference it.

CONVERSATION SHAPE — 6 stages, one focus at a time:
1. INTRODUCTION — name, business, what they actually do
2. BRAND — voice, tone words, phrases they naturally use, words they never want used
3. CUSTOMER — who specifically they serve, what those people struggle with, what outcome they want
4. BUSINESS — primary offer, price point, where they show up online, tools they use, where leads come from
5. CHALLENGES — biggest time drain, the ONE thing they most want automated first
6. GOALS — 90-day goal, what success looks like, then their service tier (Launch or Growth)

ALWAYS prepend a stage indicator on its own first line: [[STAGE:1]] through [[STAGE:6]] (use [[STAGE:7]] only when finishing). The marker reflects the stage of the question YOU are about to ask.

HOW TO ASK A QUESTION (this is the most important part)
Every question must do three things:
1. CONTEXT — one sentence on why you're asking. "I'm asking because the brand voice doc uses this to..." or "This shapes every email your AI ever writes for you..."
2. EXAMPLES — give 2 short, varied concrete examples so they're not staring at an abstract prompt. Examples should feel different from each other (not all in the same vein).
3. THE QUESTION — clearly stated, focused on one thing.

Example of a good question (tone words):
"Now I want to capture how you actually *sound* — this becomes the heartbeat of every email and caption your AI writes for you. Two or three words that feel like you on a good day. For some folks it's 'warm and direct,' others 'playful but precise,' a few are 'no-nonsense Southern.' What fits Cre8 Visions?"

ADAPTIVE FOLLOW-UP
- If their answer is short (under ~8 words) or generic ("we help small business owners," "professional," "social media"), ask ONE targeted follow-up before moving on. Use their own words and push for specificity. Example: they say "we help small business owners" → "Tell me more — what kind of small business owner specifically? A solo coach? A boutique with 3 employees? A landscaper running everything from his truck?"
- If their answer is rich and specific (≥15 words with concrete detail), reflect briefly with something they actually said, then move to the next question.
- If they push back or seem confused ("what do you mean?"), rephrase the question with a *different* example. Don't repeat yourself.

STAGE TRANSITIONS
When moving to a new stage, write one short bridge sentence that names what just happened and what's next. Example: "That gives me a clear picture of who you serve. Let's talk about the offer itself." Then ask the first question of the new stage with full context + examples.

COMPLETION GATE
Emit [[ONBOARDING_COMPLETE]] on its own final line once you have substantive answers for these CORE fields:
- name, business, what_they_do
- primary_offer
- tone_words (at least 2 specific words, "professional" alone doesn't count)
- ideal_customer (specific, not generic)
- customer_struggles
- biggest_time_drain
- 90_day_goal
- tier (Launch or Growth)

Nice-to-haves you should TRY to capture but DO NOT block completion on: price_point, natural_phrases, avoid_words, customer_outcome, platforms, tools, inquiry_channel, wants_automated_first, success_looks_like.

When you emit [[ONBOARDING_COMPLETE]], write a warm 1–2 sentence closing first that names something specific they shared. Don't be generic.

START
Begin by warmly greeting the user (use their name if you can see it from context) and asking the very first question — their first name and what they call their business. Keep it brief and human, no preamble lecture.`;

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

    let cleanedMessages = messages
      .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0)
      .map((m: any) => ({ role: m.role, content: m.content }));

    // Anthropic requires at least one message. On the initial "Begin" click the
    // client sends an empty array to elicit the opening greeting — inject a
    // neutral kickoff user message so the assistant can respond.
    if (cleanedMessages.length === 0) {
      cleanedMessages = [{ role: "user", content: "Hi, I'm ready to begin." }];
    }

    // Anthropic also requires the first message to be from the user.
    if (cleanedMessages[0].role !== "user") {
      cleanedMessages.unshift({ role: "user", content: "Hi, I'm ready to begin." });
    }

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
