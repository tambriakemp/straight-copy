// SureContact webhook receiver.
// Accepts engagement events (sent, opened, clicked, bounced, unsubscribed, etc.)
// and logs them to public.surecontact_events. Best-effort linking to a client
// via recipient_email (case-insensitive match against clients.contact_email).
//
// No shared secret is required — SureContact sends to this URL directly.
// We accept any well-formed JSON body and always return 200 unless the body
// is unparseable, so SureContact won't retry valid events forever.

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function pickString(obj: any, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = k.split(".").reduce((acc: any, part) => (acc ? acc[part] : undefined), obj);
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function pickDate(obj: any, ...keys: string[]): string | null {
  const raw = pickString(obj, ...keys);
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizeEvent(body: any) {
  // SureContact (and most ESPs) commonly use `event` or `event_type`.
  const event_type =
    pickString(body, "event_type", "event", "type", "data.event", "data.event_type") ||
    "unknown";

  const recipient_email = pickString(
    body,
    "recipient_email",
    "email",
    "contact.email",
    "recipient.email",
    "data.email",
    "data.contact.email",
  )?.toLowerCase() ?? null;

  const campaign_id = pickString(
    body,
    "campaign_id",
    "campaign.id",
    "data.campaign_id",
    "data.campaign.id",
  );
  const campaign_name = pickString(
    body,
    "campaign_name",
    "campaign.name",
    "data.campaign_name",
    "data.campaign.name",
  );
  const message_id = pickString(
    body,
    "message_id",
    "message.id",
    "data.message_id",
    "data.message.id",
  );
  const url = pickString(body, "url", "link", "data.url", "data.link");
  const ip_address = pickString(body, "ip", "ip_address", "data.ip", "data.ip_address");
  const user_agent = pickString(body, "user_agent", "ua", "data.user_agent", "data.ua");
  const occurred_at = pickDate(
    body,
    "occurred_at",
    "timestamp",
    "created_at",
    "data.timestamp",
    "data.occurred_at",
  );

  return {
    event_type,
    recipient_email,
    campaign_id,
    campaign_name,
    message_id,
    url,
    ip_address,
    user_agent,
    occurred_at,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Friendly GET response so you can paste the URL into a browser to confirm it's live.
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        message:
          "SureContact webhook receiver is live. POST JSON event payloads to this URL.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch (e) {
    console.error("[surecontact-webhook] invalid JSON", e);
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // SureContact may send a single event object or an array of events.
  const events: any[] = Array.isArray(body)
    ? body
    : Array.isArray(body?.events)
      ? body.events
      : [body];

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const rows: any[] = [];
  for (const raw of events) {
    if (!raw || typeof raw !== "object") continue;
    const norm = normalizeEvent(raw);

    let client_id: string | null = null;
    if (norm.recipient_email) {
      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .ilike("contact_email", norm.recipient_email)
        .maybeSingle();
      client_id = client?.id ?? null;
    }

    rows.push({
      ...norm,
      client_id,
      payload: raw,
    });
  }

  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase.from("surecontact_events").insert(rows);

  if (error) {
    console.error("[surecontact-webhook] insert failed", error);
    return new Response(
      JSON.stringify({ error: "Failed to log events", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Best-effort: for "opened" events, see if we can correlate to a logged
  // welcome email send and flip intake.welcome_opened. Matches by message_id
  // against email_send_log (template_name = 'onboarding-invite').
  for (const row of rows) {
    if (
      row.event_type === "opened" &&
      row.client_id &&
      typeof row.message_id === "string" &&
      row.message_id.length > 0
    ) {
      try {
        const { data: log } = await supabase
          .from("email_send_log")
          .select("template_name, recipient_email")
          .eq("message_id", row.message_id)
          .eq("template_name", "onboarding-invite")
          .limit(1)
          .maybeSingle();
        if (log) {
          const { data: node } = await supabase
            .from("journey_nodes")
            .select("id, checklist")
            .eq("client_id", row.client_id)
            .eq("key", "intake")
            .maybeSingle();
          if (node && Array.isArray(node.checklist)) {
            let mutated = false;
            const next = (node.checklist as any[]).map((it) => {
              if (it && typeof it === "object" && it.key === "intake.welcome_opened" && !it.done) {
                mutated = true;
                return { ...it, done: true };
              }
              return it;
            });
            if (mutated) {
              await supabase.from("journey_nodes").update({ checklist: next }).eq("id", node.id);
              console.log("[surecontact-webhook] flipped welcome_opened", {
                client_id: row.client_id,
              });
            }
          }
        }
      } catch (e) {
        console.warn("[surecontact-webhook] welcome_opened flip failed", e);
      }
    }
  }

  console.log(`[surecontact-webhook] logged ${rows.length} event(s)`);

  return new Response(
    JSON.stringify({ ok: true, inserted: rows.length }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
