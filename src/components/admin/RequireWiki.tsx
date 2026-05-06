import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useWikiRole } from "@/hooks/useWikiRole";

export default function RequireWiki({ children }: { children: ReactNode }) {
  const { user, loading: aLoad } = useAdminAuth();
  const { hasAccess, loading: wLoad } = useWikiRole();
  if (aLoad || wLoad) {
    return <div className="min-h-screen grid place-items-center bg-background text-foreground"><p className="text-sm text-muted-foreground">Loading…</p></div>;
  }
  if (!user) return <Navigate to="/admin/login" replace />;
  if (!hasAccess) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">No wiki access</h1>
          <p className="text-sm text-muted-foreground">Ask the founder to grant you Knowledge Base access.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
