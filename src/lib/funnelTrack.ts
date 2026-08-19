// First-party funnel tracking.
//
// The Meta pixel in src/lib/metaPixel.ts sends events to Meta and keeps nothing,
// so conversion can't be measured from our own data. This posts the same moments
// to the funnel-track edge function, which is what the Funnel tab reads.
//
// Safe to call from public pages: the ingest key authorises writes to ONE
// venture and nothing else, and the endpoint ignores anything it isn't expecting.

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/funnel-track`;
const ANON_STORAGE_KEY = "cv_funnel_anon";

/** Stable per-browser id so a visitor can be followed across funnel stages. */
function anonId(): string {
  try {
    let id = localStorage.getItem(ANON_STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_STORAGE_KEY, id);
    }
    return id;
  } catch {
    // Private mode / storage blocked — still send the event, just unlinked.
    return crypto.randomUUID();
  }
}

function readUtm(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const params = new URLSearchParams(window.location.search);
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
      const v = params.get(k);
      if (v) out[k] = v;
    }
    if (document.referrer) out.referrer = document.referrer;
  } catch { /* non-browser context */ }
  return out;
}

export interface TrackOptions {
  /** Attribute the event to a specific cohort. */
  launchId?: string;
  /** Hashed server-side; the raw address is never stored on the event. */
  email?: string;
  /** Supply to make a repeated call idempotent (e.g. one visit per session). */
  eventKey?: string;
}

/**
 * Record a funnel step. Never throws and never blocks the UI — a tracking
 * failure must not break a signup.
 */
export async function trackFunnel(
  publicKey: string,
  stage: string,
  opts: TrackOptions = {},
): Promise<void> {
  try {
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        public_key: publicKey,
        stage,
        anon_id: anonId(),
        launch_id: opts.launchId,
        email: opts.email,
        event_key: opts.eventKey,
        utm: readUtm(),
      }),
    });
  } catch (e) {
    console.warn("[funnel] event dropped", e);
  }
}
