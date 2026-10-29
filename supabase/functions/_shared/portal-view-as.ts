// Admin "view as client": the token, and the list of things it may do.
//
// CRE-811. Clicking **Open portal** on a client's `/admin` page used to hand
// the browser `/portal/<id>?as=admin` and nothing else. That is not a
// credential -- it is a request -- so whether it worked depended entirely on
// whether the NEW TAB happened to find an admin Supabase session in storage.
// When it did not, the portal did the only correct thing left and showed the
// client login. The login is for clients; Bree is not one.
//
// So the grant is now a thing the server issues rather than a thing the URL
// asserts: a short-lived, signed, single-client, READ-ONLY token minted by
// `functions/portal-view-as` for a caller it has already authenticated, and
// written to an audit log on the way out.
//
// WHY A SEPARATE TOKEN AND NOT THE ADMIN'S OWN SESSION
//
// Three properties the session cannot have:
//
//  1. **It travels.** The mint happens in the `/admin` tab, where the admin
//     session demonstrably works, and the result is carried to the new tab in
//     the URL fragment. The new tab needs no session of its own, which is the
//     exact failure this card is about.
//  2. **It is scoped to one client.** An admin session is scoped to the whole
//     company. A leaked view-as token is one client's portal for 30 minutes.
//  3. **It is read-only, and that is enforced here** -- see `VIEW_AS_READS`.
//     Bree's words on the card: she must not be able to sign or pay as the
//     client by accident. An admin session can do both.
//
// THIS MODULE IS PURE ON PURPOSE
//
// No `Deno`, no `npm:` specifiers, no environment reads -- keys arrive as
// arguments. That is what lets `src/test/portal-view-as.test.ts` exercise the
// codec and the allowlist in vitest, the same arrangement
// `client-portal-shape.ts` uses and for the same reason. The env-reading half
// lives in `webhook-auth.ts` and in the mint function.

/**
 * The format marker, and the first thing a verifier checks.
 *
 * Spelled into the token rather than inferred so that a future `cv2` -- a
 * different signature algorithm, say -- is a token today's verifier REFUSES
 * rather than one it misreads. The two halves after it are base64url with no
 * padding, so the whole token is safe in a URL fragment unescaped.
 */
export const VIEW_AS_TOKEN_PREFIX = "cv1";

/**
 * Thirty minutes, and not renewable.
 *
 * Long enough to read four screens and a contract; short enough that a token
 * recovered from a browser history or a screen recording is dead before
 * anybody acts on it. Clicking **Open portal** again mints a new one, which
 * is cheap and leaves a second audit row -- the honest record of a second
 * look.
 */
export const VIEW_AS_TTL_SECONDS = 30 * 60;

/** The header the browser carries the token in. Never a query parameter. */
export const VIEW_AS_HEADER = "x-portal-view-as";

/**
 * Who signed a token, which is also which key verifies it.
 *
 * Two issuers because there are two admin surfaces and they are separately
 * deployed: this project's own `/admin`, and the Client Portal plugin's client
 * page inside Paperclip (CRE-811 part 2). They sign with DIFFERENT keys so
 * that the plugin's key can be rotated -- or revoked outright, by unsetting
 * it -- without logging every admin out of their own preview.
 */
export type ViewAsIssuer = "admin" | "plugin";

const ISSUERS: readonly ViewAsIssuer[] = ["admin", "plugin"];

/** The verifying keys, by issuer. An absent key refuses that issuer. */
export type ViewAsKeys = Partial<Record<ViewAsIssuer, string>>;

export interface ViewAsClaims {
  iss: ViewAsIssuer;
  /** The one client this token is good for. */
  cid: string;
  /** The actor's stable id -- an `auth.users` id, or the plugin's actor id. */
  sub: string;
  /**
   * The actor in words, for the audit log and for the banner.
   *
   * An email or a display name. It is written by the issuer, who has already
   * authenticated the actor, and it is never used to authorise anything --
   * only to say afterwards who looked.
   */
  act: string;
  iat: number;
  exp: number;
  /** This token's id. One audit row per `jti`, so a reload is not a new look. */
  jti: string;
}

export type ViewAsRejection =
  | "malformed"
  | "unknown_issuer"
  | "no_key"
  | "bad_signature"
  | "expired";

export type ViewAsResult =
  | { ok: true; claims: ViewAsClaims }
  | { ok: false; reason: ViewAsRejection };

/**
 * What a view-as token may ask for, by function and by action.
 *
 * AN ALLOWLIST, AND IT FAILS CLOSED. A function that is not a key here, or an
 * action that is not in its list, refuses the token -- so a portal endpoint
 * added next month is closed to view-as until somebody puts it here on
 * purpose. The inverse (a denylist of writes) would have had the opposite
 * default, and the default is the whole question: the cost of forgetting an
 * entry here is a screen an admin cannot preview, and the cost of forgetting
 * one in a denylist is Bree signing a client's contract.
 *
 * Every entry is a read. `document` is on the list because seeing the
 * contract is seeing what the client sees, and a contract is a thing to see.
 *
 * `proposal-sign` is there for one action out of its sixteen, and not because
 * the browser calls it: `client-portal/legacy-source.ts` -- the
 * `/admin`-tables bridge that answers until CP-6's import runs -- delegates
 * `document` to it, forwarding the caller's credential so that the second
 * function forms its own opinion. `download` is the only action of its own
 * that this token may reach. `sign`, `decline` and `void` are not, which is
 * the point.
 *
 * `brand-kit-intake` and `client-files` are the two CRE-808 added (CRE-818).
 * The dark nav is seven items now, and Project and Files are two of
 * them: `resolve` is how both screens learn which live project a client has,
 * and `list` is the file table itself. `brand-kit-intake`
 * answers to six more, and five of those write -- `complete` advances the
 * client's journey node and emails the team, `fast-complete` does it with no
 * conversation at all; `client-files` has `create`, `complete`, `remove` and
 * `set_visible`. None of those is here, so a preview reads the file list and
 * cannot add to it, take from it or hide a row.
 *
 * `client-files` gained `download` in CRE-822: the plugin-backed list no
 * longer carries a link (one expires, so one on a list would be dead by the
 * time anyone clicked it), so opening or previewing a file is a second call.
 * It is a read in the same sense `reveal-login` below is -- it does not
 * change the row, and it writes its own audit entry either way -- so a
 * preview that could list files but never open one would read as broken.
 *
 * WHAT IS DELIBERATELY ABSENT. `client-logins`, `preview-approvals`,
 * `web-dev-discovery-chat`, `project-invoices` and the rest have no entry, so
 * what they answer is closed to a view-as session. Two of those are visible
 * as holes on the Project screen -- the page-review count and the discovery
 * chat -- and that screen says so in words rather than drawing a zero; see
 * `ClientProject.tsx`. Adding an entry is one line here plus that function's
 * own redeploy; doing it blind, for a function whose write actions nobody has
 * read, is how a preview learns to sign things.
 *
 * `project-phases` (CRE-822, G2) closed a third hole on that same screen:
 * before it, `ClientProject.tsx` skipped its phase-ladder fetch outright for
 * a view-as caller (`if (viewAs) return;`), so "Where things stand" rendered
 * empty rather than drawing it as a gap. It is a read for the reason
 * `home`'s milestones are: the client cannot write their own ladder either.
 */
export const VIEW_AS_READS: Record<string, readonly string[]> = {
  // `reveal-login` copies one password. It is a read: it does not change the
  // row. View-as may do it because an admin looking at the portal can copy
  // what the client can copy, and the action writes an audit row either way.
  "client-portal": [
    "home",
    "agreements",
    "payments",
    "logins",
    "document",
    "reveal-login",
    "project-phases",
  ],
  "proposal-sign": ["download"],
  "brand-kit-intake": ["resolve"],
  "client-files": ["list", "download"],
};

/** Whether `action` on `fn` is a read a view-as token may make. */
export function viewAsMayRead(fn: string, action: string): boolean {
  const allowed = VIEW_AS_READS[fn];
  return allowed !== undefined && allowed.includes(action);
}

/**
 * The function's own name, taken from its request URL.
 *
 * Supabase serves every function at `/functions/v1/<name>`, so the segment
 * after `v1` is the name. Derived rather than passed in because a function
 * that had to name itself could name itself wrong, and the wrong name here is
 * an allowlist entry pointing at nothing.
 */
export function functionNameFromUrl(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return "";
  }
  const parts = path.split("/").filter((part) => part.length > 0);
  const at = parts.indexOf("v1");
  if (at >= 0 && at + 1 < parts.length) return parts[at + 1];
  return parts[parts.length - 1] ?? "";
}

/* -- the codec ------------------------------------------------------------ */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array | null {
  // Reject anything outside the alphabet rather than letting `atob` improvise:
  // a token is machine-written, so a stray character is a forgery attempt or a
  // truncation, never a typo to be forgiven.
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmac(key: string, message: string): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", imported, encoder.encode(message));
  return new Uint8Array(signature);
}

/**
 * Length-independent, byte-for-byte comparison.
 *
 * `===` on two base64 strings leaks how many leading characters matched to
 * anybody who can time it, and a signature check is exactly the place that
 * matters.
 */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/** `iat`/`exp` filled from `now`; everything else is the caller's to state. */
export async function mintViewAsToken(
  claims: Omit<ViewAsClaims, "iat" | "exp">,
  key: string,
  now: Date = new Date(),
): Promise<{ token: string; claims: ViewAsClaims }> {
  if (key.length === 0) throw new Error("view-as: refusing to sign with an empty key");
  const iat = Math.floor(now.getTime() / 1000);
  const full: ViewAsClaims = { ...claims, iat, exp: iat + VIEW_AS_TTL_SECONDS };
  const body = `${VIEW_AS_TOKEN_PREFIX}.${base64UrlEncode(encoder.encode(JSON.stringify(full)))}`;
  const signature = base64UrlEncode(await hmac(key, body));
  return { token: `${body}.${signature}`, claims: full };
}

/**
 * The token, or why not.
 *
 * `iss` is read before the signature is checked, because it is what chooses
 * the key -- the same order a JWT header is read in. Nothing else in the
 * payload is believed until `equalBytes` has passed.
 */
export async function verifyViewAsToken(
  token: string,
  keys: ViewAsKeys,
  now: Date = new Date(),
): Promise<ViewAsResult> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VIEW_AS_TOKEN_PREFIX) {
    return { ok: false, reason: "malformed" };
  }
  const [, payloadPart, signaturePart] = parts;

  const payloadBytes = base64UrlDecode(payloadPart);
  if (payloadBytes === null) return { ok: false, reason: "malformed" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(payloadBytes));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof parsed !== "object" || parsed === null) return { ok: false, reason: "malformed" };

  const claims = parsed as Record<string, unknown>;
  const iss = claims.iss;
  if (typeof iss !== "string" || !ISSUERS.includes(iss as ViewAsIssuer)) {
    return { ok: false, reason: "unknown_issuer" };
  }
  const key = keys[iss as ViewAsIssuer];
  if (key === undefined || key.length === 0) return { ok: false, reason: "no_key" };

  const signature = base64UrlDecode(signaturePart);
  if (signature === null) return { ok: false, reason: "malformed" };
  const expected = await hmac(key, `${VIEW_AS_TOKEN_PREFIX}.${payloadPart}`);
  if (!equalBytes(signature, expected)) return { ok: false, reason: "bad_signature" };

  // Shape is checked after the signature so that a malformed payload from a
  // key holder reads as "malformed" and one from anybody else reads as
  // "bad_signature" -- the distinction a log reader needs.
  const { cid, sub, act, jti, iat, exp } = claims;
  if (
    typeof cid !== "string" || cid.length === 0
    || typeof sub !== "string" || sub.length === 0
    || typeof act !== "string"
    || typeof jti !== "string" || jti.length === 0
    || typeof iat !== "number"
    || typeof exp !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (exp * 1000 <= now.getTime()) return { ok: false, reason: "expired" };

  return {
    ok: true,
    claims: { iss: iss as ViewAsIssuer, cid, sub, act, jti, iat, exp },
  };
}
