// CRE-536: every portal edge-function call used to send the public anon
// key as its bearer token — which proves nothing, since it's the same
// key shipped to every visitor's browser. These helpers send the real
// signed-in session instead: the admin's own session when previewing a
// client's portal (?as=admin, the existing convenience from the client's
// admin page), otherwise the portal session the client just logged into.
//
// CRE-811 adds the third case, and it is the one **Open portal** now takes:
// an admin view-as session, which has NO Supabase session of its own. The
// token in `x-portal-view-as` is the whole credential, and it is checked
// against a read-only allowlist server-side. See `portalViewAs.ts`.
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portalClient";
import { VIEW_AS_HEADER, activeViewAsToken } from "@/lib/portalViewAs";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export async function portalAuthToken(adminPreview: boolean): Promise<string | null> {
  const client = adminPreview ? supabase : supabasePortal;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * The headers for one portal call, and which credential they carry.
 *
 * A view-as session short-circuits the session lookup: there is no session to
 * look up, and asking for one would cost a round trip to answer `null`.
 *
 * It still sends the anon key as the bearer, and that is on purpose rather
 * than for show. Supabase's gateway verifies a JWT in front of a function
 * unless the function is configured otherwise, and the anon key is a JWT it
 * accepts; without it a view-as request could be refused by the gateway
 * before the function ran, which would make this feature depend on a
 * `config.toml` line surviving somebody else's deploy. The anon key proves
 * nothing to the function -- `resolvePortalCaller` rejects it explicitly as a
 * credential -- so nothing is loosened by sending it.
 */
async function portalHeaders(adminPreview: boolean): Promise<Record<string, string>> {
  const viewAs = activeViewAsToken();
  if (viewAs !== null) {
    return {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      [VIEW_AS_HEADER]: viewAs,
    };
  }
  const token = await portalAuthToken(adminPreview);
  return { Authorization: `Bearer ${token ?? ""}` };
}

/** POST to a portal-facing edge function with the caller's real session. */
export async function portalFetch(
  fn: string,
  body: Record<string, unknown>,
  adminPreview: boolean,
): Promise<Response> {
  return fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await portalHeaders(adminPreview)),
    },
    body: JSON.stringify(body),
  });
}

/** GET a portal-facing edge function (query string already built by the caller). */
export async function portalFetchGet(url: string, adminPreview: boolean): Promise<Response> {
  return fetch(url, { headers: await portalHeaders(adminPreview) });
}
