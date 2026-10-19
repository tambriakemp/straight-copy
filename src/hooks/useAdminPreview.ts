import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";

/**
 * CRE-536: the existing "preview as admin" convenience
 * (/portal/:clientId?as=admin, remembered in sessionStorage so it
 * survives navigating deeper into the portal) also decides which
 * Supabase session — and which bearer token — a portal page should use.
 * Pages that already compute this inline (Portal.tsx, PortalProject.tsx)
 * keep their own copy; this is for the ones that didn't have it yet.
 */
export function useAdminPreview() {
  const { clientId } = useParams<{ clientId: string }>();
  const [searchParams] = useSearchParams();

  const impersonationKey = clientId ? `cre8-portal-as-admin-${clientId}` : "";
  const adminPreview = useMemo(() => {
    if (!clientId) return false;
    if (searchParams.get("as") === "admin") {
      try { sessionStorage.setItem(impersonationKey, "1"); } catch { /* ignore */ }
      return true;
    }
    try { return sessionStorage.getItem(impersonationKey) === "1"; } catch { return false; }
  }, [clientId, searchParams, impersonationKey]);

  return adminPreview;
}
