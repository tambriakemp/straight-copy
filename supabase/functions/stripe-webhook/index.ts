// Stripe webhook -> revenue_entries.
//
// Take the Keys sells through Stripe, so this is the path that puts training
// money in the dashboard without anyone typing it in.
//
// Signature verification is done with crypto.subtle rather than the Node Stripe
// SDK: read the RAW body first, rebuild `${t}.${rawBody}`, HMAC-SHA256 it with
// STRIPE_WEBHOOK_SECRET, and compare in constant time.
//
// Idempotency comes from the unique index on revenue_entries (source, external_id),
// so a replayed event is a no-op rather than a double count.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
// Tolerate at most 5 minutes of clock skew, per Stripe's own guidance.
const TOLERANCE_SECONDS = 300;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Verify a Stripe-Signature header against the raw body. */
async function verifyStripeSignature(rawBody: string, header: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET || !header) return false;
  let timestamp = "";
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k?.trim() === "t") timestamp = v?.trim() ?? "";
    else if (k?.trim() === "v1" && v) v1.push(v.trim());
  }
  if (!timestamp || !v1.length) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const expected = await hmacHex(WEBHOOK_SECRET, `${timestamp}.${rawBody}`);
  return v1.some((candidate) => timingSafeEqual(candidate, expected));
}

/** Stripe sends open-shaped JSON; index it rather than pretending to know it. */
type StripeObject = Record<string, unknown> & {
  id?: string;
  metadata?: Record<string, string>;
};

/** Read a nested path off an untyped Stripe payload. */
function pick(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);

const serviceClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text.trim().toLowerCase()));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Resolve which venture a Stripe object belongs to.
 * Priority: explicit metadata.venture_slug > metadata.venture_id >
 * the venture whose platform_account_ref matches a product/price on the object.
 */
async function resolveVenture(sb: ReturnType<typeof serviceClient>, obj: StripeObject) {
  const meta = obj?.metadata ?? {};
  if (meta.venture_slug) {
    const { data } = await sb.from("ventures").select("id, slug").eq("slug", meta.venture_slug).maybeSingle();
    if (data) return data;
  }
  if (meta.venture_id) {
    const { data } = await sb.from("ventures").select("id, slug").eq("id", meta.venture_id).maybeSingle();
    if (data) return data;
  }
  const lines = (pick(obj, "lines", "data") ?? []) as unknown[];
  const refs = [
    pick(obj, "price", "product"), pick(obj, "price", "id"),
    pick(obj, "plan", "product"), pick(obj, "plan", "id"),
    ...lines.map((l) => pick(l, "price", "product")),
    ...lines.map((l) => pick(l, "price", "id")),
  ].map(str).filter(Boolean) as string[];
  for (const ref of refs) {
    const { data } = await sb.from("ventures").select("id, slug").eq("platform_account_ref", ref).maybeSingle();
    if (data) return data;
  }
  // Fall back to the single Stripe-backed venture if there is exactly one.
  const { data: stripeVentures } = await sb.from("ventures").select("id, slug").eq("platform", "stripe");
  if (stripeVentures?.length === 1) return stripeVentures[0];
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Raw body MUST be read before any parsing — the signature covers these bytes.
  const rawBody = await req.text();
  if (!(await verifyStripeSignature(rawBody, req.headers.get("stripe-signature")))) {
    return json({ error: "Invalid signature" }, 400);
  }

  let event: { type?: string; id?: string; data?: { object?: StripeObject } };
  try { event = JSON.parse(rawBody); } catch { return json({ error: "Invalid JSON" }, 400); }

  const type: string = event?.type ?? "";
  const obj: StripeObject = event?.data?.object ?? {};
  const sb = serviceClient();

  try {
    // ---- Refunds: a negative cash entry, never a deletion ----
    if (type === "charge.refunded") {
      const venture = await resolveVenture(sb, obj);
      if (!venture) return json({ ok: true, ignored: "no venture match", type });
      const amount = num(obj?.amount_refunded);
      if (!amount) return json({ ok: true, ignored: "zero refund" });
      const { error } = await sb.from("revenue_entries").insert({
        venture_id: venture.id,
        launch_id: obj?.metadata?.launch_id ?? null,
        occurred_at: new Date((num(obj?.created) || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
        amount_cents: -Math.abs(amount),
        currency: (str(obj?.currency) ?? "usd").toLowerCase(),
        kind: "refund",
        source: "stripe",
        external_id: `refund_${obj?.id}`,
        customer_email: str(pick(obj, "billing_details", "email")),
        description: "Stripe refund",
        metadata: { stripe_event: type, charge_id: obj?.id },
      });
      // 23505 = replayed event. Already recorded, so this is success.
      if (error && error.code !== "23505") return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    const PAID = new Set([
      "checkout.session.completed",
      "payment_intent.succeeded",
      "invoice.paid",
    ]);
    if (!PAID.has(type)) return json({ ok: true, ignored: type });

    // Unpaid checkout sessions fire this event too — only book actual money.
    if (type === "checkout.session.completed" && obj?.payment_status && obj.payment_status !== "paid") {
      return json({ ok: true, ignored: "checkout not paid" });
    }

    const venture = await resolveVenture(sb, obj);
    if (!venture) return json({ ok: true, ignored: "no venture match", type });

    const amount = num(
      obj?.amount_total ?? obj?.amount_received ?? obj?.amount_paid ?? obj?.amount,
    );
    if (!amount) return json({ ok: true, ignored: "zero amount" });

    const email: string | null =
      str(pick(obj, "customer_details", "email")) ?? str(obj?.customer_email) ?? str(obj?.receipt_email);

    // launch_id is set as checkout metadata on the payment link for each cohort.
    let launchId: string | null = obj?.metadata?.launch_id ?? null;
    if (launchId) {
      const { data: launch } = await sb.from("venture_launches")
        .select("id").eq("id", launchId).eq("venture_id", venture.id).maybeSingle();
      if (!launch) launchId = null;   // never trust an id that isn't this venture's
    }

    const occurredAt = new Date((num(obj?.created) || Math.floor(Date.now() / 1000)) * 1000).toISOString();
    const isSubscription = type === "invoice.paid" || !!obj?.subscription;

    // One payment can arrive as several events: Stripe Checkout fires
    // checkout.session.completed (cs_...) AND payment_intent.succeeded (pi_...),
    // and a subscription charge fires invoice.paid too. Keying on the payment
    // intent makes all of them collapse onto one row via the unique index on
    // (source, external_id) — without this, every Checkout sale books twice.
    const dedupeId = str(obj?.payment_intent) ?? str(obj?.id) ?? str(event?.id);

    const { error } = await sb.from("revenue_entries").insert({
      venture_id: venture.id,
      launch_id: launchId,
      occurred_at: occurredAt,
      amount_cents: amount,
      currency: (str(obj?.currency) ?? "usd").toLowerCase(),
      kind: isSubscription ? "subscription" : "sale",
      source: "stripe",
      external_id: dedupeId,
      customer_email: email,
      customer_name: str(pick(obj, "customer_details", "name")),
      description: str(obj?.description) ?? `Stripe ${type}`,
      metadata: { stripe_event: type, stripe_object_id: obj?.id, dedupe_id: dedupeId },
    });
    if (error) {
      if (error.code === "23505") return json({ ok: true, duplicate: true });
      return json({ error: error.message }, 500);
    }

    // A payment is also the deepest funnel step, so record it as one. Best
    // effort — a funnel gap must never fail an already-booked payment.
    if (email) {
      await sb.from("funnel_events").insert({
        venture_id: venture.id,
        launch_id: launchId,
        stage: "paid",
        occurred_at: occurredAt,
        email_hash: await sha256(email),
        source: "stripe",
        event_key: `stripe_${dedupeId}`,
      });
    }

    await sb.from("activity_events").insert({
      kind: "venture_revenue",
      title: `${(amount / 100).toFixed(2)} from ${venture.slug}`,
      description: email ? `Paid by ${email}` : null,
      venture_id: venture.id,
      venture_launch_id: launchId,
      actor: "stripe",
      metadata: { type, stripe_object_id: obj?.id },
    });

    return json({ ok: true });
  } catch (e) {
    console.error("stripe-webhook error", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
