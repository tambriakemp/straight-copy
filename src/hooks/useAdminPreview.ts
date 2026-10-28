import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { adoptViewAsFromUrl, hasViewAs } from "@/lib/portalViewAs";

/**
 * Whether this portal page is being looked at by an admin rather than a
 * client, and therefore which Supabase session -- and which bearer token --
 * it should use.
 *
 * TWO WAYS IN, and the order matters.
 *
 *  1. **A view-as token** (CRE-811), carried in the URL fragment by **Open
 *     portal** and adopted into `sessionStorage` on arrival. Checked first
 *     because it is the mechanism that actually proves something: a signed,
 *     expiring, single-client, read-only grant the server issued. A tab
 *     holding one needs no admin session of its own, which is the whole
 *     reason it exists.
 *  2. **`?as=admin`** (CRE-536 and older), latched into `sessionStorage` so
 *     it survives navigating deeper into the portal. Kept because it is the
 *     path the older portal frame and a developer with an admin session still
 *     use. It asserts rather than proves, so it only works where an admin
 *     session is already in the browser -- the exact gap CRE-811 closed.
 *
 * Pages that already compute this inline (Portal.tsx, PortalProject.tsx) keep
 * their own copy; this is for the ones that didn't have it yet.
 */
export function useAdminPreview() {
  const { clientId } = useParams<{ clientId: string }>();
  const [searchParams] = useSearchParams();

  const impersonationKey = clientId ? `cre8-portal-as-admin-${clientId}` : "";
  const adminPreview = useMemo(() => {
    if (!clientId) return false;
    // Runs before the route guard decides anything, which is why it is here
    // and not in an effect: an effect would fire after the first render, and
    // the first render is the one that redirects to the client login.
    if (adoptViewAsFromUrl(clientId)) return true;
    if (searchParams.get("as") === "admin") {
      try { sessionStorage.setItem(impersonationKey, "1"); } catch { /* ignore */ }
      return true;
    }
    try { return sessionStorage.getItem(impersonationKey) === "1"; } catch { return false; }
  }, [clientId, searchParams, impersonationKey]);

  return adminPreview;
}

/**
 * Whether the admin looking at this page holds a view-as token, as opposed to
 * being signed in as an admin in this browser.
 *
 * The distinction the route guard needs: a view-as token is sufficient on its
 * own, and `?as=admin` is not.
 */
export function useViewAsGrant() {
  const { clientId } = useParams<{ clientId: string }>();
  return useMemo(() => {
    if (!clientId) return false;
    adoptViewAsFromUrl(clientId);
    return hasViewAs(clientId);
  }, [clientId]);
}
