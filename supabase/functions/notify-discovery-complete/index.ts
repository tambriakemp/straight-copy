// Sends an internal notification to the Cre8 Visions team when a Web Dev
// discovery chat is marked complete. Best-effort — never throws to the caller.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

type Msg = { role: "user" | "assistant"; content: string };

function buildSummary(conversation: Msg[]): string {
  // Trim each turn to keep email payload compact.
  return conversation
    .map((m) => {
      const who = m.role === "assistant" ? "Cre8 Visions AI" : "Client";
      const text = (m.content || "").trim();
      return `${who}: ${text}`;
    })
    .join("\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const clientId = typeof body.clientId === "string" ? body.clientId : "";
    const projectId = typeof body.projectId === "string" ? body.projectId : null;
    const conversation: Msg[] = Array.isArray(body.conversation) ? (body.conversation as Msg[]) : [];

    if (!clientId) {
      return new Response(JSON.stringify({ error: "clientId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = serviceClient();
    const { data: client } = await sb
      .from("clients")
      .select("contact_name, business_name, contact_email")
      .eq("id", clientId)
      .maybeSingle();

    const summary = buildSummary(conversation);

    await sb.functions.invoke("send-transactional-email", {
      body: {
        templateName: "web-dev-discovery-notification",
        recipientEmail: "hello@cre8visions.com",
        idempotencyKey: `web-dev-discovery-${projectId ?? clientId}`,
        templateData: {
          clientId,
          projectId,
          businessName: client?.business_name,
          contactName: client?.contact_name,
          contactEmail: client?.contact_email,
          summary,
          messageCount: conversation.length,
        },
      },
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-discovery-complete error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
