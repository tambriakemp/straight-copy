// CRE-536: every portal edge-function call used to send the public anon
// key as its bearer token — which proves nothing, since it's the same
// key shipped to every visitor's browser. These helpers send the real
// signed-in session instead: the admin's own session when previewing a
// client's portal (?as=admin, the existing convenience from the client's
// admin page), otherwise the portal session the client just logged into.
import { supabase } from "@/integrations/supabase/client";
import { supabasePortal } from "@/integrations/supabase/portalClient";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export async function portalAuthToken(adminPreview: boolean): Promise<string | null> {
  const client = adminPreview ? supabase : supabasePortal;
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}

/** POST to a portal-facing edge function with the caller's real session. */
export async function portalFetch(
  fn: string,
  body: Record<string, unknown>,
  adminPreview: boolean,
): Promise<Response> {
  const token = await portalAuthToken(adminPreview);
  return fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token ?? ""}`,
    },
    body: JSON.stringify(body),
  });
}

/** GET a portal-facing edge function (query string already built by the caller). */
export async function portalFetchGet(url: string, adminPreview: boolean): Promise<Response> {
  const token = await portalAuthToken(adminPreview);
  return fetch(url, {
    headers: { Authorization: `Bearer ${token ?? ""}` },
  });
}
