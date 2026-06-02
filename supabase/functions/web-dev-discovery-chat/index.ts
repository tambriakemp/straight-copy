// Claude-powered discovery questionnaire chat for Web Development clients.
// POST { clientId, projectId?, message, conversationHistory }
//   → { reply, history, completed }
// Persists the full conversation to public.web_dev_discovery on every turn.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 1500;
const COMPLETE_FLAG = "[[DISCOVERY_COMPLETE]]";

const SYSTEM_PROMPT_BASE = `You are the discovery assistant for Cre8 Visions, a web design agency based in Atlanta, Georgia. You are having a warm, professional conversation with a new web development client to gather everything needed to design and build their website. Your job is to feel like a thoughtful creative director asking smart questions — not a form being filled out.

Your personality is warm, direct, and encouraging. You compliment specific things the client shares. You never use hollow phrases like "great question" or "absolutely." When a client gives a vague or one-word answer you do not move on — you dig deeper with a natural follow-up. When a client gives a rich, detailed answer you acknowledge something specific from what they said before moving to the next question.

You must collect the following information before the conversation can be marked complete. Work through these naturally — do not ask multiple questions at once. Ask one question at a time and wait for the response before continuing.

Business fundamentals — their business name, what they do in one sentence, who their ideal customer is and what problem they solve for them, and what the primary goal of the website is (generating leads, booking appointments, selling services, building authority, or something else).

Visual direction — ask them to describe how they want the website to feel using words (examples: clean and minimal, bold and editorial, warm and inviting, luxury and refined). Then ask for three to five websites they love — inside or outside their industry — and what specifically they love about each one. Then ask for two or three competitor websites and what they like and dislike about each one.

Brand assets — ask what brand assets they already have ready. This includes their logo (and what format), brand colors (hex codes or descriptions), fonts if they have them, and any existing photography or brand imagery. If they have none of these, note it and move on.

Pages and content — ask which pages they need on the website. Give examples: home, about, services, contact, booking, portfolio, blog, FAQ, pricing, team. For each page they confirm, ask a brief follow-up about the goal of that page. Then ask about the content they already have ready versus what still needs to be written or sourced.

Features — ask what specific features or functionality they need beyond a standard website. Examples: contact form, online booking or scheduling, newsletter signup, client login, payment processing, video embedding, chat widget, social media feed. Note anything outside the standard package as a potential add-on.

Domain and hosting — ask if they already own a domain name and if so what it is. Ask which registrar they use (GoDaddy, Namecheap, Squarespace, Google Domains, etc.) because they will need to provide login access when the time comes.

Final priorities — ask what the one thing is that the website absolutely must get right. This is their non-negotiable. Then ask if there is anything else they want to make sure the designer knows before starting.

Vague answer rules you must follow without exception — if a client says something like "I want it to look professional" or "clean and modern" or "just make it nice," do not accept this and move on. Ask a follow-up like "Can you tell me more about what professional looks like for your business? For example is it more corporate and structured, or editorial and refined, or warm and approachable?" If a client gives a one-word answer to a question about their audience, ask them to describe a specific person — their age, what they do, what they are struggling with, what they want. If a client says they have no competitor websites, say something like "Even businesses you admire in a different industry? Or someone whose website you wish looked more like yours?" and give them a moment to think about it. If a client lists pages without explaining what each one should do, ask about one of the pages — "What do you want someone to do or feel after landing on your services page?" If a client says they do not know what features they need, walk them through a few common ones and ask about each briefly.

Opening message — start the conversation with exactly this: "Hey {{FIRST_NAME}}! I am so excited to start working on your website. Before I dive in, I want to make sure I understand your business, your vision, and your goals so the design really reflects who you are. This is going to feel more like a conversation than a questionnaire — just answer naturally and we will work through it together. Ready? Let us start with the most important thing. Tell me about your business. What do you do, and who do you do it for?"

When all required information has been collected, send a closing message that summarizes what you learned in a warm, confident paragraph — the business, the visual direction, the pages, the key features, and the one non-negotiable. Then say "I am going to pass all of this to Bree now so she can start planning your design. You will hear from us within 48 hours with your first look. In the meantime if anything comes to mind that you forgot to mention, you can always reach us at hello@cre8visions.com." Then append the literal marker ${COMPLETE_FLAG} on its own final line so the system knows the conversation is complete.`;

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

type Msg = { role: "user" | "assistant"; content: string };

function cleanAssistant(text: string): { display: string; complete: boolean } {
  const complete = text.includes(COMPLETE_FLAG);
  const display = text.replace(COMPLETE_FLAG, "").trim();
  return { display, complete };
}

async function markDiscoveryTaskComplete(sb: ReturnType<typeof serviceClient>, projectId: string) {
  try {
    // Task 1.4 — Creative discovery questionnaire completed by client
    const { data: tasks } = await sb
      .from("project_tasks")
      .select("id, status")
      .eq("client_project_id", projectId)
      .ilike("name", "1.4 %");
    if (!tasks || tasks.length === 0) return;
    const now = new Date().toISOString();
    for (const t of tasks) {
      if (t.status === "complete") continue;
      await sb.from("project_tasks").update({ status: "complete", completed_at: now }).eq("id", t.id);
      await sb.from("project_task_activity").insert({
        task_id: t.id,
        kind: "auto_complete",
        message: "Auto-completed when client finished AI discovery questionnaire.",
        metadata: { source: "web-dev-discovery-chat" },
      });
    }
  } catch (e) {
    console.error("[web-dev-discovery-chat] task auto-complete failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const clientId = typeof body.clientId === "string" ? body.clientId : "";
    const projectId = typeof body.projectId === "string" ? body.projectId : null;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const history: Msg[] = Array.isArray(body.conversationHistory)
      ? (body.conversationHistory as Msg[]).filter(
          (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
        )
      : [];

    if (!clientId) {
      return new Response(JSON.stringify({ error: "clientId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = serviceClient();

    // Pull client first-name for the opening greeting personalization.
    const { data: client } = await sb
      .from("clients")
      .select("id, contact_name, business_name, contact_email")
      .eq("id", clientId)
      .maybeSingle();
    const firstName =
      (client?.contact_name?.trim().split(/\s+/)[0]) || "there";

    const systemPrompt = SYSTEM_PROMPT_BASE.replaceAll("{{FIRST_NAME}}", firstName);

    // Build the Anthropic messages payload.
    const turns: Msg[] = history.map((m) => ({ role: m.role, content: m.content }));
    if (message) turns.push({ role: "user", content: message });

    // Anthropic requires the first message to be a user message, and at least one.
    if (turns.length === 0 || turns[0].role !== "user") {
      turns.unshift({ role: "user", content: "Hi, I'm ready to begin." });
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: turns,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("Anthropic error:", resp.status, errText);
      const status = resp.status === 429 || resp.status === 529 ? 429 : 502;
      return new Response(
        JSON.stringify({ error: status === 429 ? "AI is busy. Please wait a moment and try again." : "AI service error" }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await resp.json();
    const rawReply: string = Array.isArray(data?.content)
      ? data.content.map((c: any) => (typeof c?.text === "string" ? c.text : "")).join("").trim()
      : "";

    if (!rawReply) {
      return new Response(JSON.stringify({ error: "Empty AI response" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { display, complete } = cleanAssistant(rawReply);

    // Updated history (what the client should render & echo back next turn).
    const updatedHistory: Msg[] = [
      ...history,
      ...(message ? [{ role: "user" as const, content: message }] : []),
      { role: "assistant" as const, content: display },
    ];

    // Persist (upsert by client_project_id when present, else by client_id).
    const submittedAt = complete ? new Date().toISOString() : null;
    try {
      const { data: existing } = await sb
        .from("web_dev_discovery")
        .select("id, completed, submitted_at")
        .match(projectId ? { client_project_id: projectId } : { client_id: clientId })
        .maybeSingle();

      const payload = {
        client_id: clientId,
        client_project_id: projectId,
        conversation: updatedHistory,
        ...(complete
          ? { completed: true, submitted_at: existing?.submitted_at ?? submittedAt }
          : {}),
      };

      if (existing?.id) {
        await sb.from("web_dev_discovery").update(payload).eq("id", existing.id);
      } else {
        await sb.from("web_dev_discovery").insert(payload);
      }
    } catch (e) {
      console.error("[web-dev-discovery-chat] persist failed:", e);
    }

    // On completion: mark Task 1.4 complete and fire notification email.
    if (complete) {
      if (projectId) await markDiscoveryTaskComplete(sb, projectId);

      try {
        await sb.functions.invoke("notify-discovery-complete", {
          body: {
            clientId,
            projectId,
            conversation: updatedHistory,
          },
        });
      } catch (e) {
        console.error("[web-dev-discovery-chat] notify failed (non-fatal):", e);
      }
    }

    return new Response(
      JSON.stringify({
        reply: display,
        history: updatedHistory,
        completed: complete,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("web-dev-discovery-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
