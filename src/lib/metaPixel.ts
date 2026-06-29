// Meta Pixel + Conversions API helpers
// Pixel ID is public — safe to ship in client code.
export const META_PIXEL_ID = "2233428127414824";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export type MetaEventName =
  | "PageView"
  | "Lead"
  | "CompleteRegistration"
  | "Contact"
  | "ClickContactCTA"
  | "ViewContent";


// ---- Normalization + validation helpers ----
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw?: string): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  if (!EMAIL_RE.test(v) || v.length > 254) {
    console.warn("[meta] dropped invalid email for CAPI");
    return undefined;
  }
  return v;
}

function normalizePhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  // Keep digits only; require 7-15 digits per E.164.
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    console.warn("[meta] dropped invalid phone for CAPI");
    return undefined;
  }
  return digits;
}

/**
 * Fire a Meta Pixel browser event AND send a matching server-side
 * Conversions API event (deduped by event_id).
 *
 * Optionally accepts a caller-supplied eventId so two events
 * (e.g. CTA click + final Lead submit) can share dedup IDs.
 * Returns the event_id used.
 */
export function trackMetaEvent(
  eventName: MetaEventName,
  params: Record<string, unknown> = {},
  user: { email?: string; phone?: string } = {},
  eventId?: string
): string {
  const id = eventId ?? (crypto as Crypto).randomUUID();

  const email = normalizeEmail(user.email);
  const phone = normalizePhone(user.phone);

  if (eventName === "Lead" && !email && !phone) {
    console.warn("[meta] Lead event has no email or phone — match quality will be low");
  }

  // 1. Browser pixel
  try {
    window.fbq?.("track", eventName, params, { eventID: id });
  } catch (err) {
    console.warn("[meta] fbq failed", err);
  }

  // 2. Server-side CAPI (deduped by event_id)
  try {
    const user_data: Record<string, string> = {};
    if (email) user_data.email = email;
    if (phone) user_data.phone = phone;

    void fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-capi`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_name: eventName,
          event_id: id,
          event_source_url: window.location.href,
          custom_data: params,
          user_data,
        }),
        keepalive: true,
      }
    );
  } catch (err) {
    console.warn("[meta] capi dispatch failed", err);
  }

  return id;
}
