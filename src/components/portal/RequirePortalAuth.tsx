import { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { usePortalAuth } from "@/hooks/usePortalAuth";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useAdminPreview } from "@/hooks/useAdminPreview";

/**
 * Guards every /portal/:clientId* route. CRE-536: a bare link used to be
 * enough to see a client's data; now it needs one of two sessions:
 *  - a portal session whose client_portal_users row matches THIS :clientId, or
 *  - an admin session with ?as=admin (the existing preview-as-admin path),
 *    remembered in sessionStorage the same way Portal.tsx already does.
 * Old links with neither land here and redirect to the portal login,
 * which sends them back to the same URL once they're signed in.
 */
export default function RequirePortalAuth({ children }: { children: ReactNode }) {
  const { clientId } = useParams<{ clientId: string }>();
  const { loading: portalLoading, user: portalUser, isMemberOf } = usePortalAuth();
  const { loading: adminLoading, user: adminUser, isAdmin } = useAdminAuth();
  const adminPreview = useAdminPreview();

  if (portalLoading || (adminPreview && adminLoading)) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (adminPreview && adminUser && isAdmin) {
    return <>{children}</>;
  }

  if (portalUser && clientId && isMemberOf(clientId)) {
    return <>{children}</>;
  }

  // Signed in, just not to THIS client's portal — a clear denial, not a
  // redirect loop back to a login they'd already pass.
  if (portalUser) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="text-sm text-muted-foreground">
            Your account isn't set up for this client's portal.
          </p>
        </div>
      </div>
    );
  }

  const returnTo = `${window.location.pathname}${window.location.search}`;
  return <Navigate to={`/portal/login?next=${encodeURIComponent(returnTo)}`} replace />;
}
