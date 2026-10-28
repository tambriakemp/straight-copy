// The browser half of admin view-as-client (CRE-811).
//
// **Open portal** on a client's `/admin` page used to be a link to
// `/portal/<id>?as=admin`, which is not a credential but a request: it worked
// only if the new tab happened to find an admin Supabase session in storage,
// and showed the CLIENT LOGIN when it did not. The login is for clients.
//
// Now the `/admin` tab -- where the admin session is already proven -- asks
// the server for a token, and carries it to the portal tab in the URL
// fragment. Four properties, and each one is a line of code below:
//
//  1. **The fragment never reaches a server**, so the token is not in an
//     access log, not in a `Referer`, not in anything an edge proxy records.
//  2. **It is stripped from the address bar on arrival**, so it is not in
//     browser history and not in a screenshot of the URL.
//  3. **It lives in `sessionStorage`**, so it dies with the tab and cannot be
//     waiting in a client's browser tomorrow.
//  4. **The server does not trust any of this.** The token is signed, scoped
//     to one client, expires, and is checked against a read-only allowlist on
//     every request -- see `supabase/functions/_shared/portal-view-as.ts`.
//     Everything here is transport.

import { supabase } from "@/integrations/supabase/client";

/**
 * Mirror of `VIEW_AS_HEADER` in
 * `supabase/functions/_shared/portal-view-as.ts`.
 *
 * Two copies because `tsconfig.app.json` includes only `src`, the same reason
 * `clientPortalWire.ts` is a mirror. `src/test/portal-view-as.test.ts` reads
 * the canonical file off disk and fails if the two strings drift, because the
 * symptom of a drift is every portal request 401ing with nothing in the
 * console to say why.
 */
export const VIEW_AS_HEADER = "x-portal-view-as";

/** The fragment key the `/admin` side writes and this side consumes. */
export const VIEW_AS_FRAGMENT = "view-as";

/** One tab shows one client's portal, so one slot. */
const STORAGE_KEY = "cre8-portal-view-as";

interface StoredViewAs {
  clientId: string;
  token: string;
  /** Unix seconds, copied out of the token so expiry is checkable offline. */
  exp: number;
  /** The admin, in words, for the banner. Written by the server. */
  actor: string;
}

function read(): StoredViewAs | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<StoredViewAs>;
    if (
      typeof parsed.clientId !== "string"
      || typeof parsed.token !== "string"
      || typeof parsed.exp !== "number"
    ) {
      return null;
    }
    return {
      clientId: parsed.clientId,
      token: parsed.token,
      exp: parsed.exp,
      actor: typeof parsed.actor === "string" ? parsed.actor : "",
    };
  } catch {
    return null;
  }
}

function write(value: StoredViewAs): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* storage disabled: the session lasts this page load, which still works */
  }
}

export function clearViewAs(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * The claims, read WITHOUT verifying the signature.
 *
 * For the banner and the expiry check only. The signature is checked by the
 * server on every request, and nothing here may decide anything that matters
 * -- a token whose payload this function believes is still a token the server
 * will throw out.
 */
function peekClaims(token: string): { cid: string; exp: number; act: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "cv1") return null;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/")
      + "=".repeat((4 - (parts[1].length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as Record<string, unknown>;
    if (typeof claims.cid !== "string" || typeof claims.exp !== "number") return null;
    return {
      cid: claims.cid,
      exp: claims.exp,
      act: typeof claims.act === "string" ? claims.act : "",
    };
  } catch {
    return null;
  }
}

/**
 * Takes a token out of the URL fragment, if there is one for this client.
 *
 * Call it synchronously while deciding whether this is a view-as session --
 * before the route guard decides anything -- the same place
 * `useAdminPreview` already reads `?as=admin`. Returns whether a view-as
 * session is now active for `clientId`.
 *
 * REPLACES THE URL whether or not the token was good, so a bad one is not
 * left in the address bar to be retried or shared.
 */
export function adoptViewAsFromUrl(clientId: string | undefined): boolean {
  if (typeof window === "undefined" || !clientId) return false;

  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  const token = new URLSearchParams(hash).get(VIEW_AS_FRAGMENT);
  if (token === null) return hasViewAs(clientId);

  // The `#anchor` case: a portal link can carry `#portal-discovery`, and
  // `URLSearchParams` would not have found a token in that, so we only get
  // here when the fragment really was ours. Dropping it entirely is therefore
  // safe and is what keeps the token out of history.
  try {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
  } catch {
    /* a browser that refuses replaceState still gets a working session */
  }

  // Reverse tabnabbing has no teeth between two pages of the same origin, but
  // the opener handle has no use here either, and the tidiest thing to do
  // with a capability you do not need is to drop it.
  try {
    window.opener = null;
  } catch {
    /* read-only in some browsers; nothing is lost */
  }

  const claims = peekClaims(token);
  if (claims === null || claims.cid !== clientId) return hasViewAs(clientId);

  write({ clientId, token, exp: claims.exp, actor: claims.act });
  return true;
}

/** The live token for `clientId`, or `null`. Expired tokens are cleared. */
export function viewAsTokenFor(clientId: string | undefined): string | null {
  const stored = read();
  if (stored === null) return null;
  if (stored.exp * 1000 <= Date.now()) {
    clearViewAs();
    return null;
  }
  if (clientId !== undefined && stored.clientId !== clientId) return null;
  return stored.token;
}

/** The live token for whatever client this tab is viewing, or `null`. */
export function activeViewAsToken(): string | null {
  return viewAsTokenFor(undefined);
}

export function hasViewAs(clientId: string | undefined): boolean {
  return viewAsTokenFor(clientId) !== null;
}

/** The admin whose look this is, for the banner. Empty when unknown. */
export function viewAsActor(): string {
  return read()?.actor ?? "";
}

export interface MintedViewAs {
  token: string;
  url: string;
  expiresAt: string;
  clientName: string | null;
}

export class ViewAsError extends Error {}

/**
 * Asks the server for a view-as grant. `/admin` only.
 *
 * Sends the admin's own session, because that is what the server
 * authenticates -- this is the one call in the flow that needs it, and it is
 * made from the tab that has it.
 */
export async function mintViewAs(clientId: string): Promise<MintedViewAs> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new ViewAsError("Your admin session has expired. Sign in again and retry.");
  }

  const { data, error } = await supabase.functions.invoke<
    MintedViewAs & { error?: string }
  >("portal-view-as", { body: { clientId } });

  // `functions.invoke` reports a non-2xx as an error and keeps the body out of
  // reach, so the server's own sentence -- "not set up on this install yet",
  // "that client is not there" -- is the one worth showing when we have it.
  if (error) {
    const said = typeof data?.error === "string" ? data.error : null;
    throw new ViewAsError(said ?? "Could not open that client's portal. Please try again.");
  }
  if (!data || typeof data.url !== "string" || typeof data.token !== "string") {
    throw new ViewAsError("Could not open that client's portal. Please try again.");
  }
  return {
    token: data.token,
    url: data.url,
    expiresAt: data.expiresAt,
    clientName: data.clientName ?? null,
  };
}

/**
 * Mints a grant and opens the client's portal in a new tab.
 *
 * The tab is opened SYNCHRONOUSLY, before the await, and navigated when the
 * token arrives: a `window.open` on the far side of a promise is a popup a
 * browser blocks, and the failure looks exactly like the button doing
 * nothing. The blank tab is closed if the mint fails, so a refusal leaves one
 * error on the admin page rather than a stranded about:blank.
 */
export async function openPortalAsClient(clientId: string): Promise<void> {
  const tab = typeof window === "undefined" ? null : window.open("", "_blank");
  try {
    const { url } = await mintViewAs(clientId);
    if (tab) tab.location.replace(url);
    else window.location.assign(url);
  } catch (caught) {
    tab?.close();
    throw caught;
  }
}
