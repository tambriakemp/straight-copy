// Public edge function for invite resolution + auto-saving onboarding sessions.
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
  } catch (e) {
    console.error("summary AI failed:", e);
    return {};
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json();
    const { action, token } = body || {};

    if (!action || typeof action !== "string") return json({ error: "action required" }, 400);
    if (!token || typeof token !== "string") return json({ error: "token required" }, 400);

    // Lookup invite
    const { data: invite, error: inviteErr } = await supabase
      .from("onboarding_invites")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (inviteErr) {
      console.error("invite lookup failed:", inviteErr);
      return json({ error: "lookup failed" }, 500);
    }
    if (!invite) return json({ error: "invite not found" }, 404);
    if (invite.revoked) return json({ error: "invite revoked" }, 410);
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return json({ error: "invite expired" }, 410);
    }

    // RESOLVE — fetch invite + any in-progress submission
    if (action === "resolve") {
      let conversation: unknown[] = [];
      let stage = 1;
      let completed = false;
      if (invite.submission_id) {
        const { data: sub } = await supabase
          .from("onboarding_submissions")
          .select("conversation,completed,summary")
          .eq("id", invite.submission_id)
          .maybeSingle();
        if (sub) {
          conversation = Array.isArray(sub.conversation) ? sub.conversation : [];
          completed = sub.completed;
          // crude stage estimate from message count if not stored
          stage = Math.min(7, Math.max(1, Math.ceil(conversation.length / 4)));
        }
      }
      // Update last_opened_at (best-effort)
      await supabase
        .from("onboarding_invites")
        .update({ last_opened_at: new Date().toISOString() })
        .eq("id", invite.id);

      return json({
        invite: {
          contact_name: invite.contact_name,
          contact_email: invite.contact_email,
          business_name: invite.business_name,
        },
        conversation,
        stage,
        completed,
      });
    }

    // SAVE — upsert in-progress submission
    if (action === "save") {
      const { conversation, stage } = body;
      if (!Array.isArray(conversation)) return json({ error: "conversation array required" }, 400);

      const now = new Date().toISOString();
      let submissionId = invite.submission_id as string | null;

      if (!submissionId) {
        const { data: inserted, error: insErr } = await supabase
          .from("onboarding_submissions")
          .insert({
            conversation,
            completed: false,
            invite_id: invite.id,
            last_activity_at: now,
            contact_name: invite.contact_name,
            contact_email: invite.contact_email,
            business_name: invite.business_name,
          })
          .select()
          .single();
        if (insErr) {
          console.error("create submission failed:", insErr);
          return json({ error: "save failed" }, 500);
        }
        submissionId = inserted.id;
        await supabase
          .from("onboarding_invites")
          .update({ submission_id: submissionId })
          .eq("id", invite.id);
      } else {
        const { error: updErr } = await supabase
          .from("onboarding_submissions")
          .update({ conversation, last_activity_at: now })
          .eq("id", submissionId);
        if (updErr) {
          console.error("update submission failed:", updErr);
          return json({ error: "save failed" }, 500);
        }
      }

      return json({ ok: true, submissionId, stage });
    }

    // COMPLETE — finalize, run summary, notify owner
    if (action === "complete") {
      const { conversation } = body;
      if (!Array.isArray(conversation) || conversation.length === 0) {
        return json({ error: "conversation required" }, 400);
      }

      // Generate summary
      const transcript = conversation
        .map((m: any) => `${m.role === "user" ? "CLIENT" : "AI"}: ${m.content}`)
        .join("\n\n");

      let summary: any = {};
      try {
        const summaryResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: SUMMARY_SYSTEM },
              { role: "user", content: `Conversation:\n\n${transcript}` },
            ],
            response_format: { type: "json_object" },
          }),
        });
        if (summaryResp.ok) {
          const j = await summaryResp.json();
          try {
            summary = JSON.parse(j.choices?.[0]?.message?.content || "{}");
          } catch {
            summary = { raw: j.choices?.[0]?.message?.content };
          }
        }
      } catch (e) {
        console.error("summary AI failed:", e);
      }

      // Upsert + complete the submission
      let submissionId = invite.submission_id as string | null;
      if (!submissionId) {
        const { data: inserted, error: insErr } = await supabase
          .from("onboarding_submissions")
          .insert({
            conversation,
            completed: true,
            invite_id: invite.id,
            summary,
            business_name: summary.business_name || invite.business_name,
            contact_name: summary.contact_name || invite.contact_name,
            contact_email: summary.contact_email || invite.contact_email,
            last_activity_at: new Date().toISOString(),
          })
          .select()
          .single();
        if (insErr) {
          console.error("complete insert failed:", insErr);
          return json({ error: "complete failed" }, 500);
        }
        submissionId = inserted.id;
      } else {
        const { error: updErr } = await supabase
          .from("onboarding_submissions")
          .update({
            conversation,
            summary,
            completed: true,
            business_name: summary.business_name || invite.business_name,
            contact_name: summary.contact_name || invite.contact_name,
            contact_email: summary.contact_email || invite.contact_email,
            last_activity_at: new Date().toISOString(),
          })
          .eq("id", submissionId);
        if (updErr) {
          console.error("complete update failed:", updErr);
          return json({ error: "complete failed" }, 500);
        }
      }

      await supabase
        .from("onboarding_invites")
        .update({ submission_id: submissionId, completed_at: new Date().toISOString() })
        .eq("id", invite.id);

      // Notify owner (fire-and-forget)
      try {
        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "onboarding-notification",
            recipientEmail: OWNER_EMAIL,
            idempotencyKey: `onboarding-${submissionId}`,
            templateData: {
              submissionId,
              businessName: summary.business_name || invite.business_name || "Unknown",
              contactName: summary.contact_name || invite.contact_name || "Unknown",
              contactEmail: summary.contact_email || invite.contact_email || "Not provided",
              summary,
            },
          },
        });
      } catch (e) {
        console.error("email notify failed (non-fatal):", e);
      }

      return json({ ok: true, id: submissionId, summary });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("onboarding-session error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
