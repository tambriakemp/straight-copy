// Meta Conversions API proxy. Public endpoint (no JWT) — pixel-equivalent.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const PIXEL_ID = Deno.env.get("META_PIXEL_ID") ?? "732407937637618";
const ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
const TEST_EVENT_CODE = Deno.env.get("META_TEST_EVENT_CODE"); // optional

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface Body {
  event_name: string;
  event_id: string;
  event_source_url?: string;
  custom_data?: Record<string, unknown>;
  user_data?: { email?: string; phone?: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!ACCESS_TOKEN) {
    return new Response(
      JSON.stringify({ error: "META_ACCESS_TOKEN not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body?.event_name || !body?.event_id) {
    return new Response(JSON.stringify({ error: "event_name and event_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") || undefined;
  const ua = req.headers.get("user-agent") || undefined;

  const user_data: Record<string, unknown> = {};

  const rawEmail = body.user_data?.email?.trim().toLowerCase();
  if (rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) && rawEmail.length <= 254) {
    user_data.em = [await sha256(rawEmail)];
  } else if (body.user_data?.email) {
    console.warn("[meta-capi] dropped invalid email", { event: body.event_name });
  }

  const rawPhone = body.user_data?.phone?.replace(/\D/g, "");
  if (rawPhone && rawPhone.length >= 7 && rawPhone.length <= 15) {
    user_data.ph = [await sha256(rawPhone)];
  } else if (body.user_data?.phone) {
    console.warn("[meta-capi] dropped invalid phone", { event: body.event_name });
  }

  if (ip) user_data.client_ip_address = ip;
  if (ua) user_data.client_user_agent = ua;

  if (!user_data.em && !user_data.ph && !ip && !ua) {
    console.warn("[meta-capi] event has no user_data — match quality will be low", {
      event: body.event_name,
      event_id: body.event_id,
    });
  }

  const payload: Record<string, unknown> = {
    data: [
      {
        event_name: body.event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id: body.event_id,
        action_source: "website",
        event_source_url: body.event_source_url,
        user_data,
        custom_data: body.custom_data ?? {},
      },
    ],
  };
  if (TEST_EVENT_CODE) payload.test_event_code = TEST_EVENT_CODE;

  const url = `https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await resp.text();

  if (!resp.ok) console.error("[meta-capi]", resp.status, text);

  return new Response(text, {
    status: resp.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
