// Streaming AI chat for guided client onboarding (Anthropic Claude)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLAUDE_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 1024;

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

// Transform Anthropic SSE → OpenAI-compatible SSE (so the frontend parser keeps working unchanged).
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

    // Anthropic expects only user/assistant roles in messages; system is top-level.
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
