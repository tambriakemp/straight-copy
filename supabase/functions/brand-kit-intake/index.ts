// Public client-portal edge function powering the Brand Kit (Node 03) intake.
// Actions:
//   - resolve : returns client + active node + saved transcript
//   - chat    : streams Claude responses, autosaves the transcript
//   - complete: extracts structured intake, persists it, advances Node 03,
//               and emails the team via send-transactional-email.
//
// verify_jwt = false (public). All access is mediated by the function.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `You are the CRE8 Visions Brand Kit guide — a warm, editorial, deeply curious creative director helping a client define the visual foundation of their brand.

Tone: confident, considered, never corporate. Short, intentional sentences. Occasional *italics* for emphasis. No emojis, no exclamation marks.

THE CONVERSATION HAS 7 STAGES — work through them in order, ONE QUESTION AT A TIME:
1. LOGO — do they have an existing logo or wordmark? What do they need? (logo, wordmark, icon, refresh, brand new)
2. COLORS — color direction, palette feeling, any non-negotiable hues, anything to avoid
3. TYPOGRAPHY — type personality (editorial serif, modern sans, etc.), references they admire
4. REFERENCES — 3-5 specific visual references / brands / moodboard inspirations and what they love about each
5. RULES — visual do's and don'ts (textures, motifs, things that are *off-brand*)
6. FORMATS — what file formats / asset types they need (SVG, PNG, social templates, etc.)
7. SCOPE — final deliverable scope (logo suite, color tokens, type system, brand guidelines doc, etc.)

CONVERSATION RULES:
- Ask ONE question at a time. Never bundle multiple questions.
- After each user answer, briefly reflect back in 1 short sentence (don't compliment), then ask the next question.
- If an answer is vague or one-word, follow up before moving on. Vague data produces a vague brand kit.
- Use their name and business if you know them. Reference earlier answers to show you're listening.
- Stay on the current stage until you have a substantive answer, then transition naturally.
- Always include a stage indicator on its own first line in this exact format: [[STAGE:1]] through [[STAGE:7]] reflecting YOUR CURRENT question. After completion use [[STAGE:8]].

REQUIRED FIELDS — DO NOT complete the conversation until you have substantive answers for ALL of these:
- logo
- colors
- typography
- references
- dos
- donts
- formats
- scope

WHEN YOU HAVE EVERYTHING:
Once every required field has a substantive answer, write a warm one-line closing acknowledging what you've captured. On its own line at the very end of that final message, output exactly: [[BRAND_KIT_COMPLETE]]
Do NOT output [[BRAND_KIT_COMPLETE]] until every required field is genuinely covered.

Begin by warmly greeting the client by name if known, and asking the very first question (about their existing logo / what they need).`;

const EXTRACT_TOOL = {
  name: "extract_brand_kit",
  description: "Extract a structured Brand Kit intake summary from the client conversation.",
  input_schema: {
    type: "object",
    properties: {
      logo: { type: "string", description: "Logo / wordmark situation and what they need." },
      colors: { type: "string", description: "Color direction and palette feeling." },
      typography: { type: "string", description: "Typography personality and references." },
      references: {
        type: "array",
        items: { type: "string" },
        description: "Specific visual / brand references they cited.",
      },
      dos: {
        type: "array",
        items: { type: "string" },
        description: "Visual do's — textures, motifs, things that feel on-brand.",
      },
      donts: {
        type: "array",
        items: { type: "string" },
        description: "Visual don'ts — things that are explicitly off-brand.",
      },
      formats: {
        type: "array",
        items: { type: "string" },
        description: "File formats and asset types they need.",
      },
      scope: { type: "string", description: "Final deliverable scope summary." },
      notes: { type: "string", description: "Any additional notes or context." },
    },
    required: ["logo", "colors", "typography", "references", "dos", "donts", "formats", "scope"],
  },
};

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
            } catch {/* partial */}
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

async function extractIntake(
  transcript: string,
  apiKey: string,
  context: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const resp = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        system: "You extract a structured Brand Kit intake from a client conversation. Pull values ONLY from what the user actually said — never invent. For arrays, return short specific items. If a field truly wasn't covered, return an empty string or empty array.",
        tools: [EXTRACT_TOOL],
        tool_choice: { type: "tool", name: "extract_brand_kit" },
        messages: [
          {
            role: "user",
            content: `Client context: ${JSON.stringify(context)}\n\nConversation transcript:\n\n${transcript}`,
          },
        ],
      }),
    });
    if (!resp.ok) {
      console.error("[brand-kit-intake] extract error:", resp.status, await resp.text().catch(() => ""));
      return {};
    }
    const j = await resp.json();
    const toolUse = (j.content || []).find((c: any) => c.type === "tool_use");
    return (toolUse?.input ?? {}) as Record<string, unknown>;
  } catch (e) {
    console.error("[brand-kit-intake] extract failed:", e);
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json();
    const clientId: string | undefined = body.clientId;
    const action: string = body.action;

    if (!clientId || !action) {
      return new Response(JSON.stringify({ error: "clientId and action required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate the client via the SECURITY DEFINER RPC (also confirms not archived).
    const { data: portalData, error: portalErr } = await supabase.rpc("get_portal_client", {
      _client_id: clientId,
    });
    if (portalErr) throw new Error(`Portal lookup failed: ${portalErr.message}`);
    if (!portalData) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- RESOLVE ----------
    if (action === "resolve") {
      const { data: row } = await supabase
        .from("clients")
        .select("brand_kit_conversation, brand_kit_intake_submitted_at, contact_email")
        .eq("id", clientId)
        .maybeSingle();
      return new Response(
        JSON.stringify({
          client: portalData,
          contactEmail: row?.contact_email ?? null,
          conversation: row?.brand_kit_conversation ?? [],
          submittedAt: row?.brand_kit_intake_submitted_at ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------- CHAT (streaming) ----------
    if (action === "chat") {
      if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const cleaned = messages
        .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .map((m: any) => ({ role: m.role, content: m.content }));

      // Best-effort: stash latest transcript snapshot for resume.
      supabase
        .from("clients")
        .update({ brand_kit_conversation: cleaned })
        .eq("id", clientId)
        .then(({ error }) => { if (error) console.warn("autosave failed:", error.message); });

      const ctx = {
        contact_name: (portalData as any).contact_name,
        business_name: (portalData as any).business_name,
        tier: (portalData as any).tier,
      };
      const contextualSystem = `${SYSTEM_PROMPT}\n\nClient context: ${JSON.stringify(ctx)}`;

      const upstream = await fetch(ANTHROPIC_API, {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: MAX_TOKENS,
          system: contextualSystem,
          messages: cleaned,
          stream: true,
        }),
      });

      if (!upstream.ok || !upstream.body) {
        const txt = await upstream.text().catch(() => "");
        console.error("Anthropic error:", upstream.status, txt);
        const code = upstream.status === 429 || upstream.status === 529 ? 429 : 500;
        return new Response(JSON.stringify({ error: code === 429 ? "Rate limit reached. Please wait a moment." : "AI service error" }), {
          status: code,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(transformAnthropicStream(upstream.body), {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // ---------- COMPLETE ----------
    if (action === "complete") {
      if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const transcript = messages
        .filter((m: any) => m && typeof m.content === "string")
        .map((m: any) => `${m.role === "user" ? "Client" : "Guide"}: ${m.content}`)
        .join("\n\n");

      const ctx = {
        contact_name: (portalData as any).contact_name,
        business_name: (portalData as any).business_name,
      };
      const intake = await extractIntake(transcript, ANTHROPIC_API_KEY, ctx);
      const submittedAt = new Date().toISOString();

      // 1. Persist intake on clients row + final transcript.
      const { error: updErr } = await supabase
        .from("clients")
        .update({
          brand_kit_intake: intake,
          brand_kit_intake_submitted_at: submittedAt,
          brand_kit_conversation: messages,
        })
        .eq("id", clientId);
      if (updErr) throw new Error(`Save intake failed: ${updErr.message}`);

      // 2. Advance Node 03 — auto-check the client-submitted items, mark as client_submitted.
      const { data: bkNode } = await supabase
        .from("journey_nodes")
        .select("id, started_at, checklist")
        .eq("client_id", clientId)
        .eq("key", "brand_kit")
        .maybeSingle();
      if (bkNode) {
        // Map intake fields → auto_keys that should flip to done.
        const intakeObj = (intake || {}) as Record<string, unknown>;
        const filled = (val: unknown): boolean => {
          if (val == null) return false;
          if (typeof val === "string") return val.trim().length > 0;
          if (Array.isArray(val)) return val.length > 0;
          if (typeof val === "object") return Object.keys(val as object).length > 0;
          return Boolean(val);
        };
        const autoKeyMatches: Record<string, boolean> = {
          brand_kit_logos:      filled(intakeObj.logos) || filled(intakeObj.logo) || filled(intakeObj.logo_files) || filled(intakeObj.logo_references),
          brand_kit_colors:     filled(intakeObj.colors) || filled(intakeObj.color_palette) || filled(intakeObj.palette),
          brand_kit_typography: filled(intakeObj.typography) || filled(intakeObj.fonts) || filled(intakeObj.type),
          brand_kit_references: filled(intakeObj.visual_references) || filled(intakeObj.moodboard) || filled(intakeObj.references) || filled(intakeObj.inspiration),
          brand_kit_guidelines: filled(intakeObj.guidelines) || filled(intakeObj.dos_and_donts) || filled(intakeObj.brand_rules) || filled(intakeObj.deliverable_scope),
        };
        const currentChecklist = Array.isArray(bkNode.checklist) ? bkNode.checklist as any[] : [];
        const nextChecklist = currentChecklist.map((it: any) => {
          if (it && it.auto_key && autoKeyMatches[it.auto_key]) {
            return { ...it, done: true };
          }
          return it;
        });

        await supabase
          .from("journey_nodes")
          .update({
            status: "client_submitted",
            started_at: bkNode.started_at ?? submittedAt,
            notes: "Client submitted Brand Kit intake via portal.",
            checklist: nextChecklist,
          })
          .eq("id", bkNode.id);
      }

      // 3. Notify the team via transactional email (best-effort).
      try {
        const { data: row } = await supabase
          .from("clients")
          .select("contact_email, contact_name, business_name")
          .eq("id", clientId)
          .maybeSingle();

        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "brand-kit-notification",
            recipientEmail: "hello@cre8visions.com",
            idempotencyKey: `brand-kit-${clientId}-${submittedAt}`,
            templateData: {
              clientId,
              businessName: row?.business_name,
              contactName: row?.contact_name,
              contactEmail: row?.contact_email,
              intake,
            },
          },
        });
      } catch (mailErr) {
        console.error("[brand-kit-intake] notification email failed (non-fatal):", mailErr);
      }

      return new Response(
        JSON.stringify({ success: true, intake, submittedAt }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------- ACCOUNT ACCESS: RESOLVE ----------
    if (action === "account-access-resolve") {
      const { data: row } = await supabase
        .from("clients")
        .select("client_account_access")
        .eq("id", clientId)
        .maybeSingle();
      return new Response(
        JSON.stringify({ accountAccess: row?.client_account_access ?? {} }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------- ACCOUNT ACCESS: SAVE ----------
    if (action === "account-access-save") {
      const payload = (body.accountAccess && typeof body.accountAccess === "object")
        ? body.accountAccess as Record<string, unknown>
        : {};

      // Whitelist + sanitize fields
      const KNOWN_KEYS = new Set([
        "surecontact", "ottokit", "social_media",
        "social_instagram", "social_tiktok", "social_linkedin", "social_facebook", "social_youtube",
        "website", "heygen", "claude",
      ]);
      const sanitizedChecks: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(payload.checks ?? {})) {
        if (KNOWN_KEYS.has(k)) sanitizedChecks[k] = Boolean(v);
      }
      const notes = typeof payload.notes === "string" ? payload.notes.slice(0, 4000) : "";
      const files: Array<{ path: string; name: string; size: number }> = Array.isArray(payload.files)
        ? (payload.files as any[]).slice(0, 10).map((f) => ({
            path: typeof f?.path === "string" ? f.path.slice(0, 500) : "",
            name: typeof f?.name === "string" ? f.name.slice(0, 200) : "",
            size: typeof f?.size === "number" ? f.size : 0,
          })).filter((f) => f.path)
        : [];

      // Tier-aware "all required" check
      const tier = (portalData as any).tier as string;
      const requiredKeys = ["surecontact", "ottokit", "social_media", "website"];
      if (tier === "growth") requiredKeys.push("heygen", "claude");
      const allDone = requiredKeys.every((k) => sanitizedChecks[k] === true);
      const submittedAt = allDone ? new Date().toISOString() : null;

      const nextState = {
        checks: sanitizedChecks,
        notes,
        files,
        updated_at: new Date().toISOString(),
        submitted_at: submittedAt,
      };

      const { error: updErr } = await supabase
        .from("clients")
        .update({ client_account_access: nextState })
        .eq("id", clientId);
      if (updErr) throw new Error(`Save account access failed: ${updErr.message}`);

      // If complete, flip the intake node's accounts_submitted item to done
      if (allDone) {
        const { data: intakeNode } = await supabase
          .from("journey_nodes")
          .select("id, checklist")
          .eq("client_id", clientId)
          .eq("key", "intake")
          .maybeSingle();
        if (intakeNode) {
          const current = Array.isArray(intakeNode.checklist) ? intakeNode.checklist as any[] : [];
          const next = current.map((it: any) =>
            it && it.auto_key === "accounts_submitted" ? { ...it, done: true } : it
          );
          await supabase
            .from("journey_nodes")
            .update({ checklist: next })
            .eq("id", intakeNode.id);
        }
      }

      return new Response(
        JSON.stringify({ success: true, accountAccess: nextState }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[brand-kit-intake] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
