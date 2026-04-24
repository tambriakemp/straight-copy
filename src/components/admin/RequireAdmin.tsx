import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { loading, user, isAdmin } = useAdminAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-foreground">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/admin/login" replace />;

  if (!isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center bg-background p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="text-sm text-muted-foreground">
            Your account isn't on the admin list yet. Ask the site owner to grant you access, then refresh.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
