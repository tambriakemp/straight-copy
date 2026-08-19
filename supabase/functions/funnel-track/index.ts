// Public funnel ingest. No JWT — this is called from the browser.
//
// The Meta pixel (src/lib/metaPixel.ts + meta-capi) fires and forgets, so there
// is no first-party record of who moved through a funnel. This endpoint is that
// record, and it is what makes conversion measurable from our own database.
//
// Safety rules, all enforced below:
//   * Callers present a venture's public_ingest_key, never its uuid.
//   * The stage must exist in that venture's configured funnel_stages.
//   * Email is hashed server-side; the raw address is never stored here.
//   * Any client-supplied money is ignored — cash only enters via Stripe.
//   * Body size and every field length is capped.
//   * Repeat event_key values are absorbed by a unique index, not an error.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MAX_BODY_BYTES = 4096;
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "referrer"] as const;

const clip = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.trim().toLowerCase()));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Payload too large" }, 413);

  let body: Record<string, unknown>;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }

  const publicKey = clip(body.public_key, 128);
  const stage = clip(body.stage, 40);
  if (!publicKey || !stage) return json({ error: "public_key and stage are required" }, 400);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: venture } = await sb
      .from("ventures")
      .select("id, slug, status, funnel_stages")
      .eq("public_ingest_key", publicKey)
      .maybeSingle();
    // Same 404 for a bad key and an archived venture — don't confirm key validity.
    if (!venture || venture.status === "archived") return json({ error: "Not found" }, 404);

    const allowed = new Set(
      (Array.isArray(venture.funnel_stages) ? venture.funnel_stages : [])
        .map((s: { key?: string }) => s?.key)
        .filter(Boolean),
    );
    if (!allowed.has(stage)) {
      return json({ error: "Unknown stage for this venture", stage }, 400);
    }

    // Only accept a launch that actually belongs to this venture.
    let launchId: string | null = clip(body.launch_id, 64);
    if (launchId) {
      const { data: launch } = await sb.from("venture_launches")
        .select("id").eq("id", launchId).eq("venture_id", venture.id).maybeSingle();
      if (!launch) launchId = null;
    }

    const utm: Record<string, string> = {};
    const rawUtm = (body.utm ?? {}) as Record<string, unknown>;
    for (const k of UTM_KEYS) {
      const v = clip(rawUtm[k], 200);
      if (v) utm[k] = v;
    }

    const email = clip(body.email, 254);
    const { error } = await sb.from("funnel_events").insert({
      venture_id: venture.id,
      launch_id: launchId,
      stage,
      anon_id: clip(body.anon_id, 64),
      email_hash: email && email.includes("@") ? await sha256(email) : null,
      source: "web",
      utm,
      event_key: clip(body.event_key, 128),
    });

    // 23505 = same event_key already recorded. Idempotent, so report success.
    if (error && error.code !== "23505") {
      console.error("funnel-track insert failed", error);
      return json({ error: "Could not record event" }, 500);
    }

    return json({ ok: true });
  } catch (e) {
    console.error("funnel-track error", e);
    return json({ error: "Could not record event" }, 500);
  }
});
