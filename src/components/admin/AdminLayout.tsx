import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNewAdminLayout } from "@/hooks/useNewAdminLayout";
import MobileTabBar from "./MobileTabBar";
import MobileTopBar from "./MobileTopBar";
import WorkspaceMenu from "./WorkspaceMenu";
import AdminShell from "./cv/AdminShell";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const { enabled: newLayout } = useNewAdminLayout();

  // CRE-332: the new light side-nav shell, behind a toggle on /admin/profile.
  // Every admin page wraps itself in AdminLayout, so branching here re-shells
  // all of them at once rather than one route at a time.
  if (newLayout) {
    return <AdminShell isMobile={isMobile}>{children}</AdminShell>;
  }

  if (isMobile) {
    return (
      <div className="crm-shell">
        <MobileTopBar />
        <div className="crm-page">{children}</div>
        <MobileTabBar />
      </div>
    );
  }

  return (
    <div className="crm-shell">
      {/* Navigation lives in the workspace menu now — the bar carries only
          where you are, not every place you could go. */}
      <nav className="topnav">
        <div className="topnav__left">
          <WorkspaceMenu />
        </div>
      </nav>

      <div className="crm-page">{children}</div>
    </div>
  );
}
