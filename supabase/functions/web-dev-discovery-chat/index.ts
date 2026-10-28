// Claude-powered discovery questionnaire chat for Web Development clients.
// POST { clientId, projectId?, message, conversationHistory }
//   → { reply, history, completed, warnings? }
// Persists the full conversation to public.web_dev_discovery on every turn,
// plus a structured extraction of it once the client reaches the end.
//
// CRE-536: requires the caller's own bearer token to resolve to an ACTIVE
// portal member of clientId (or an admin) via resolvePortalCaller.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { resolvePortalCaller } from "../_shared/webhook-auth.ts";
import { CLAUDE_MODEL } from "../_shared/models.ts";
import { findLatestWebDevProject } from "../_shared/web-dev-emails.ts";
import { completePaperclipBlueprintStep } from "../_shared/paperclip-sync.ts";
import { GATE_QUESTIONS, missingGateTopics } from "../_shared/discovery-gate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

Online presence and on-site contact details — ask for links to any social media profiles they want connected to the new site (Instagram, Facebook, LinkedIn, TikTok, etc.), or an explicit confirmation that they have none yet. Then ask exactly what contact information they want visible on the site: phone number, public email address, physical address if relevant, business hours, and the geographic area they serve. Get an explicit answer on each of these — do not assume none are wanted just because they weren't volunteered.

Wording and voice — ask whether there is specific language they want on the site: a tagline or phrase they already use, testimonials they want featured, licenses or credentials to display, or words and phrases to absolutely avoid. If they say there is nothing specific, confirm that explicitly rather than skipping past it.

Final priorities — ask what the one thing is that the website absolutely must get right. This is their non-negotiable. Then ask if there is anything else they want to make sure the designer knows before starting.

Vague answer rules you must follow without exception — if a client says something like "I want it to look professional" or "clean and modern" or "just make it nice," do not accept this and move on. Ask a follow-up like "Can you tell me more about what professional looks like for your business? For example is it more corporate and structured, or editorial and refined, or warm and approachable?" If a client gives a one-word answer to a question about their audience, ask them to describe a specific person — their age, what they do, what they are struggling with, what they want. If a client says they have no competitor websites, say something like "Even businesses you admire in a different industry? Or someone whose website you wish looked more like yours?" and give them a moment to think about it. If a client lists pages without explaining what each one should do, ask about one of the pages — "What do you want someone to do or feel after landing on your services page?" If a client says they do not know what features they need, walk them through a few common ones and ask about each briefly.

Opening message — start the conversation with exactly this: "Hey {{FIRST_NAME}}! I am so excited to start working on your website. Before I dive in, I want to make sure I understand your business, your vision, and your goals so the design really reflects who you are. This is going to feel more like a conversation than a questionnaire — just answer naturally and we will work through it together. Ready? Let us start with the most important thing. Tell me about your business. What do you do, and who do you do it for?"

When all required information has been collected, send a closing message that summarizes what you learned in a warm, confident paragraph — the business, the visual direction, the pages, the key features, and the one non-negotiable. Then say "I am going to pass all of this to Bree now. Your next step is the Brand Kit — that's where we lock in your logo, colors, and visual direction, and it just unlocked in your portal. In the meantime if anything comes to mind that you forgot to mention, you can always reach us at hello@cre8visions.com." Then append the literal marker ${COMPLETE_FLAG} on its own final line so the system knows the conversation is complete.`;

// Extraction tool: pulls the conversation into structured fields, following
// the same forced tool_choice pattern as brand-kit-intake. The *_asked
// booleans are what the completion gate below checks — they must be true
// (the topic was actually raised, whatever the client's answer was) before
// the client's own [[DISCOVERY_COMPLETE]] marker is trusted.
const EXTRACT_TOOL = {
  name: "extract_discovery",
  description: "Extract a structured discovery intake summary from the client conversation.",
  input_schema: {
    type: "object",
    properties: {
      business_name: { type: "string" },
      business_summary: { type: "string", description: "What they do, who they serve, and the problem they solve." },
      website_goal: { type: "string", description: "Primary goal of the website." },
      visual_direction: { type: "string" },
      inspiration_sites: { type: "array", items: { type: "string" } },
      competitor_sites: { type: "array", items: { type: "string" } },
      brand_assets: { type: "string", description: "Logo, brand colors, fonts, and existing photography they already have ready." },
      pages: { type: "array", items: { type: "string" }, description: "Pages requested, each noted with its goal." },
      content_readiness: { type: "string" },
      features: { type: "array", items: { type: "string" } },
      domain: { type: "string", description: "Domain name and registrar, or a note that they need one." },
      must_get_right: { type: "string" },
      final_notes: { type: "string" },

      social_links: {
        type: "array",
        items: { type: "string" },
        description: "Social media profile URLs the client wants connected to the site. Empty array if they confirmed they have none.",
      },
      social_links_asked: {
        type: "boolean",
        description: "True once the client was explicitly asked about social links, regardless of their answer.",
      },

      site_contact: {
        type: "object",
        properties: {
          phone: { type: "string" },
          email: { type: "string" },
          address: { type: "string" },
          hours: { type: "string" },
          service_area: { type: "string" },
        },
        description: "On-site contact details the client wants visible. Leave a field as an empty string if it doesn't apply.",
      },
      site_contact_asked: {
        type: "boolean",
        description: "True once the client was explicitly asked about on-site contact details (phone, email, address, hours, service area), regardless of their answer.",
      },

      wording: {
        type: "object",
        properties: {
          include: { type: "array", items: { type: "string" }, description: "Taglines, phrases, testimonials, or licenses/credentials to include." },
          avoid: { type: "array", items: { type: "string" }, description: "Words or phrases to never use." },
        },
      },
      wording_asked: {
        type: "boolean",
        description: "True once the client was explicitly asked about specific wording to include or avoid, regardless of their answer.",
      },
    },
    required: ["social_links", "social_links_asked", "site_contact", "site_contact_asked", "wording", "wording_asked"],
  },
};

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

async function extractDiscoveryIntake(
  transcript: string,
  apiKey: string,
): Promise<Record<string, unknown>> {
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        system: "You extract a structured discovery intake from a client conversation. Pull values ONLY from what the user actually said — never invent. For arrays, return short specific items. If a field truly wasn't covered, return an empty string, empty array, or false for an *_asked boolean.",
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "tool", name: "extract_discovery" },
        messages: [{ role: "user", content: `Conversation transcript:\n\n${transcript}` }],
      }),
    });
    if (!resp.ok) {
      console.error("[web-dev-discovery-chat] extract error:", resp.status, await resp.text().catch(() => ""));
      return {};
    }
    const j = await resp.json();
    const toolUse = (j.content || []).find((c: any) => c.type === "tool_use");
    return (toolUse?.input ?? {}) as Record<string, unknown>;
  } catch (e) {
    console.error("[web-dev-discovery-chat] extract failed:", e);
    return {};
  }
}

function transcriptOf(history: Msg[]): string {
  return history.map((m) => `${m.role === "assistant" ? "Cre8 Visions AI" : "Client"}: ${m.content}`).join("\n\n");
}

async function markDiscoveryTaskComplete(
  sb: ReturnType<typeof serviceClient>,
  projectId: string,
  warnings: string[],
) {
  try {
    // Task 1.4 — Creative discovery questionnaire completed by client
    const { data: tasks, error: fetchErr } = await sb
      .from("project_tasks")
      .select("id, status")
      .eq("client_project_id", projectId)
      .ilike("name", "1.4 %");
    if (fetchErr) {
      warnings.push(`Could not look up the discovery task: ${fetchErr.message}`);
      return;
    }
    if (!tasks || tasks.length === 0) return;
    const now = new Date().toISOString();
    for (const t of tasks) {
      if (t.status === "complete") continue;
      const { error: updErr } = await sb
        .from("project_tasks")
        .update({ status: "complete", completed_at: now })
        .eq("id", t.id);
      if (updErr) {
        warnings.push(`Could not mark the discovery task complete: ${updErr.message}`);
        continue;
      }
      await sb.from("project_task_activity").insert({
        task_id: t.id,
        kind: "auto_complete",
        message: "Auto-completed when client finished AI discovery questionnaire.",
        metadata: { source: "web-dev-discovery-chat" },
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[web-dev-discovery-chat] task auto-complete failed:", msg);
    warnings.push(`Could not mark the discovery task complete: ${msg}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const warnings: string[] = [];

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const clientId = typeof body.clientId === "string" ? body.clientId : "";
    let projectId = typeof body.projectId === "string" ? body.projectId : null;
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

    const caller = await resolvePortalCaller(req, clientId);
    if (caller.kind === "unauthorized") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
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

    // A client can have more than one project — matching on client_id alone
    // with .maybeSingle() errors in that case. Resolve the active web
    // development project explicitly rather than guess.
    if (!projectId) {
      const proj = await findLatestWebDevProject(sb, clientId);
      if (!proj) {
        return new Response(JSON.stringify({ error: "No web development project found for this client." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      projectId = proj.id;
    }

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

    let { display, complete } = cleanAssistant(rawReply);

    // History including the model's raw attempt, used below to decide
    // whether its closing attempt should actually be trusted.
    const historyWithRawReply: Msg[] = [
      ...history,
      ...(message ? [{ role: "user" as const, content: message }] : []),
      { role: "assistant" as const, content: display },
    ];

    let extracted: Record<string, unknown> | null = null;
    if (complete) {
      extracted = await extractDiscoveryIntake(transcriptOf(historyWithRawReply), ANTHROPIC_API_KEY);
      const missing = missingGateTopics(extracted);
      if (missing.length > 0) {
        // The client's own [[DISCOVERY_COMPLETE]] marker isn't enough —
        // required topics were never actually raised. Don't end the
        // conversation; ask the first missing one instead of the model's
        // closing message.
        complete = false;
        display = GATE_QUESTIONS[missing[0]];
      }
    }

    // Updated history (what the client should render & echo back next turn).
    const updatedHistory: Msg[] = [
      ...history,
      ...(message ? [{ role: "user" as const, content: message }] : []),
      { role: "assistant" as const, content: display },
    ];

    // Persist (upsert by client_project_id). Always keep the latest
    // extraction snapshot around, even on a gate-blocked attempt, so the
    // agency can see progress without reading the raw transcript.
    const submittedAt = complete ? new Date().toISOString() : null;
    try {
      const { data: existing, error: fetchErr } = await sb
        .from("web_dev_discovery")
        .select("id, submitted_at")
        .eq("client_project_id", projectId)
        .maybeSingle();
      if (fetchErr) throw fetchErr;

      const payload: Record<string, unknown> = {
        client_id: clientId,
        client_project_id: projectId,
        conversation: updatedHistory,
        ...(extracted ? { extracted_intake: extracted } : {}),
        ...(complete
          ? { completed: true, submitted_at: existing?.submitted_at ?? submittedAt }
          : {}),
      };

      if (existing?.id) {
        const { error: updErr } = await sb.from("web_dev_discovery").update(payload).eq("id", existing.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await sb.from("web_dev_discovery").insert(payload);
        if (insErr) throw insErr;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      console.error("[web-dev-discovery-chat] persist failed:", msg);
      warnings.push(`Your answer may not have saved: ${msg}`);
    }

    // On completion: mark Task 1.4 complete, sync to the matching Paperclip
    // blueprint step (best-effort), and fire the notification email.
    if (complete) {
      await markDiscoveryTaskComplete(sb, projectId, warnings);

      const paperclipResult = await completePaperclipBlueprintStep(
        sb,
        projectId,
        "discovery",
        "Auto-completed: client finished the web dev discovery chat in the portal.",
      );
      if (!paperclipResult.ok) {
        warnings.push(`Could not sync discovery completion to Paperclip: ${paperclipResult.error}`);
      }

      try {
        await sb.functions.invoke("notify-discovery-complete", {
          body: {
            clientId,
            projectId,
            conversation: updatedHistory,
            submittedAt,
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        console.error("[web-dev-discovery-chat] notify failed (non-fatal):", msg);
        warnings.push(`The team notification email may not have sent: ${msg}`);
      }
    }

    return new Response(
      JSON.stringify({
        reply: display,
        history: updatedHistory,
        completed: complete,
        ...(warnings.length > 0 ? { warnings } : {}),
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
