// Meta Pixel + Conversions API helpers
// Pixel ID is public — safe to ship in client code.
export const META_PIXEL_ID = "732407937637618";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

type MetaEventName = "PageView" | "Lead" | "CompleteRegistration" | "Contact";

/**
 * Fire a Meta Pixel browser event AND send a matching server-side
 * Conversions API event (best-effort, fire-and-forget).
 */
export function trackMetaEvent(
  eventName: MetaEventName,
  params: Record<string, unknown> = {},
  user: { email?: string; phone?: string } = {}
) {
  const eventId = (crypto as Crypto).randomUUID();

  // 1. Browser pixel
  try {
    window.fbq?.("track", eventName, params, { eventID: eventId });
  } catch (err) {
    console.warn("[meta] fbq failed", err);
  }

  // 2. Server-side CAPI (deduped by eventId)
  try {
    void fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-capi`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_name: eventName,
          event_id: eventId,
          event_source_url: window.location.href,
          custom_data: params,
          user_data: {
            email: user.email,
            phone: user.phone,
          },
        }),
        keepalive: true,
      }
    );
  } catch (err) {
    console.warn("[meta] capi dispatch failed", err);
  }
}
