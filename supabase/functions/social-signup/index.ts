// The social plan signup: take the answers, then hand off to Stripe.
//
// Public (verify_jwt = false) — this is the top of the funnel, before anyone
// is a client. It never sees card details: it creates a Checkout Session and
// returns its URL, and Stripe collects payment.
//
// The answers are captured BEFORE payment rather than at it, for two reasons.
// Stripe Checkout allows at most three custom fields and the social plan needs
// a dozen. And an abandoned checkout still leaves the answers here, which makes
// it a lead rather than nothing.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import {
  normalizeSignup, signupProblems, type SignupInput,
} from "../_shared/social/signup.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const STRIPE_API = "https://api.stripe.com/v1/checkout/sessions";

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const priceId = Deno.env.get("STRIPE_SOCIAL_PRICE_ID");
  const siteUrl = (Deno.env.get("SITE_URL") ?? "https://cre8visions.com").replace(/\/$/, "");
  if (!secretKey || !priceId) {
    return json({ error: "Payments are not configured yet" }, 500);
  }

  let body: SignupInput;
  try {
    body = await req.json() as SignupInput;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const signup = normalizeSignup(body);
  const problems = signupProblems(signup);
  if (problems.length) return json({ error: problems[0], problems }, 400);

  const sb = serviceClient();

  // One pending signup per email. Someone who fills the form, wanders off and
  // comes back should continue the same row rather than leaving a trail of
  // half-finished ones for a human to reconcile later.
  const { data: existing } = await sb.from("social_signups")
    .select("id, status").eq("email", signup.email).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const row = {
    email: signup.email,
    contact_name: signup.contact_name,
    business_name: signup.business_name,
    phone: signup.phone,
    timezone: signup.timezone,
    answers: signup as unknown as Record<string, unknown>,
    consented_at: signup.consent ? new Date().toISOString() : null,
    status: "pending",
  };

  let signupId: string | null = null;
  if (existing?.id) {
    await sb.from("social_signups").update(row).eq("id", existing.id);
    signupId = existing.id;
  } else {
    const { data: created, error } = await sb.from("social_signups")
      .insert(row).select("id").maybeSingle();
    if (error || !created) {
      return json({ error: error?.message ?? "Could not start the signup" }, 500);
    }
    signupId = created.id;
  }

  // Stripe's API is form-encoded. No SDK: the repo calls every other third
  // party with fetch, and one endpoint does not justify a dependency in a
  // Deno function.
  const form = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    customer_email: signup.email,
    client_reference_id: signupId!,
    success_url: `${siteUrl}/social/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/social?cancelled=1`,
    "metadata[signup_id]": signupId!,
    // Repeated onto the subscription so later lifecycle events — a failed
    // payment months from now — can still be traced back to this signup
    // without a lookup table.
    "subscription_data[metadata][signup_id]": signupId!,
    allow_promotion_codes: "true",
  });

  const res = await fetch(STRIPE_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Stripe replays this rather than double-charging if the call is retried.
      "Idempotency-Key": `social-signup-${signupId}`,
    },
    body: form,
  });

  const session = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (session as { error?: { message?: string } })?.error?.message;
    console.error("stripe checkout session failed", res.status, message);
    return json({ error: "Could not start checkout. Please try again." }, 502);
  }

  await sb.from("social_signups")
    .update({ stripe_session_id: (session as { id?: string }).id ?? null })
    .eq("id", signupId!);

  return json({ ok: true, url: (session as { url?: string }).url, signup_id: signupId });
});
