// Verifying that a webhook really came from Stripe.
//
// Import-free — no npm: specifiers, no Deno globals — so the frontend test
// suite can import it and `tsc` covers it. Uses Web Crypto, which both Deno and
// the test runner provide.
//
// Lifted from stripe-webhook/index.ts, which serves the ventures pipeline. The
// two are kept apart deliberately: that one carries STRIPE_WEBHOOK_SECRET for
// venture revenue, this one is called with the CRM endpoint's own secret, so a
// leak of one does not authorise writes to the other. The logic is identical
// and now lives in one place with tests.

/** Stripe's own guidance: tolerate at most five minutes of clock skew. */
export const TOLERANCE_SECONDS = 300;

/** Constant-time compare, so a wrong signature leaks nothing by how long it took. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface StripeSignatureHeader {
  timestamp: string;
  signatures: string[];
}

/** Split a `t=...,v1=...,v1=...` header. Stripe sends more than one v1 during a secret roll. */
export function parseSignatureHeader(header: string): StripeSignatureHeader {
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k?.trim() === "t") timestamp = v?.trim() ?? "";
    else if (k?.trim() === "v1" && v) signatures.push(v.trim());
  }
  return { timestamp, signatures };
}

/**
 * Whether this body really came from Stripe, signed with this secret, recently.
 *
 * The timestamp check is the half that is easy to leave out and matters most:
 * without it a valid signature is replayable forever, so anyone who ever saw
 * one captured event could resend it and re-run whatever it triggers.
 *
 * `now` is injected rather than read from the clock so the skew window can be
 * tested at its edges.
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!secret || !header) return false;

  const { timestamp, signatures } = parseSignatureHeader(header);
  if (!timestamp || !signatures.length) return false;

  const age = Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const expected = await hmacHex(secret, `${timestamp}.${rawBody}`);
  return signatures.some((candidate) => timingSafeEqual(candidate, expected));
}
