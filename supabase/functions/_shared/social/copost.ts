// Talking to CoPost.
//
// Import-free on purpose — no `npm:` specifiers, no Deno globals — so the
// frontend test suite can import it directly. Same reason as
// _shared/agents/schedule.ts and table-access.ts: a Deno specifier does not
// resolve under the app's tsconfig, and the alternative is logic that only
// gets checked at deploy, on a database we cannot deploy to ourselves.
//
// ---------------------------------------------------------------------------
// THE CONTRACT, and what is still unverified.
//
// What ships today is the TRIGGER URL integration: a per-project URL of the
// form https://api.copost.io/triggers/<id>, stored encrypted in
// project_secrets as `copost_endpoint_url`, POSTed as JSON
// { postText, images?, tags? }. There is no API key — the URL IS the
// credential — and no callback. This half is verified: it is what
// send-to-copost and send-images-to-copost have been doing in production.
//
// What SCHEDULING needs is CoPost's REST API, which is a different thing.
// Their site documents POST /api/posts/create, POST /api/drafts/create and
// POST /api/drafts/publish, authentication by API key or OAuth 2.0, and
// outgoing webhooks for post published / failed / scheduled. The reference
// itself sits behind registration and renders client-side, so the exact auth
// header, base URL, scheduled-date field name, timezone handling and channel
// identifier are NOT verified.
//
// So: everything below the divider is the verified trigger-URL path and is
// safe. Everything above it is the REST shape, written to one guess, and is
// the only code that should need touching once the real contract is in hand.
// Fill in CONTRACT_UNVERIFIED and delete this paragraph when it is.
// ---------------------------------------------------------------------------

/** Marks a field whose real name is not yet confirmed against CoPost's docs. */
export const CONTRACT_UNVERIFIED = {
  /** Header carrying the API key. Their site says "API keys"; format unknown. */
  authHeader: "Authorization",
  authScheme: "Bearer",
  baseUrl: "https://api.copost.io",
  createPostPath: "/api/posts/create",
  /** The field carrying the future send time on a create-post call. */
  scheduledAtField: "scheduledAt",
} as const;

// ---------------------------------------------------------------------------
// Verified: the trigger-URL payload.
// ---------------------------------------------------------------------------

/** CoPost rejects a post carrying more than ten images. */
export const MAX_IMAGES = 10;

/** Ten is also the tag ceiling the existing senders have always applied. */
export const MAX_TAGS = 10;

export interface CopostPayload {
  postText: string;
  images: string[];
  tags?: string[];
  [key: string]: unknown;
}

/**
 * The post body: caption, then hashtags, separated by a blank line.
 *
 * Lifted verbatim from send-to-copost so the two cannot drift while both
 * exist. Hashtags are normalised to exactly one leading `#` — they are stored
 * without one, but a caption written by hand often has them.
 */
export function buildPostText(
  caption: string | null,
  hashtags: string[] | null,
): string {
  const parts: string[] = [];
  if (caption?.trim()) parts.push(caption.trim());
  if (hashtags?.length) {
    parts.push(hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" "));
  }
  return parts.join("\n\n");
}

/**
 * CoPost validates that an image URL ends in an image extension, and a
 * Supabase signed URL ends in `?token=…`. Appending a `#.png` fragment
 * satisfies the check, and fragments are stripped before the HTTP request is
 * made, so the download still works.
 *
 * Idempotent: calling it twice does not produce `#.png#.png`.
 */
export function withImageExtension(signedUrl: string): string {
  return signedUrl.endsWith("#.png") ? signedUrl : `${signedUrl}#.png`;
}

/** The JSON body for one post. Caps images and tags rather than failing. */
export function copostPayload(input: {
  caption: string | null;
  hashtags: string[] | null;
  imageUrls: string[];
}): CopostPayload {
  const payload: CopostPayload = {
    postText: buildPostText(input.caption, input.hashtags),
    images: input.imageUrls.slice(0, MAX_IMAGES).map(withImageExtension),
  };
  if (input.hashtags?.length) {
    payload.tags = input.hashtags
      .slice(0, MAX_TAGS)
      .map((h) => h.replace(/^#/, ""));
  }
  return payload;
}

/**
 * Whether a stored CoPost URL is one we are willing to POST to.
 *
 * Checked on write AND on read: a value that was valid when it was stored is
 * still attacker-controlled by the time it is used, and the cost of checking
 * twice is nothing.
 *
 * Note the host test. Both existing senders use `host.endsWith("copost.io")`,
 * and `"evilcopost.io".endsWith("copost.io")` is true — so the suffix check
 * they rely on accepts a lookalike domain. The exposure is small because the
 * value is admin-entered, but it is wrong, and this is the one place it is
 * now right. The two senders still carry the old test; moving them over is a
 * separate task, because three edge functions that must redeploy together on
 * a platform where someone else decides when to deploy is a change that
 * half-lands.
 */
export function isValidCopostEndpoint(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  return host === "copost.io" || host.endsWith(".copost.io");
}
