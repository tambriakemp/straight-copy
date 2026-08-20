import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import MobileTabBar from "./MobileTabBar";
import MobileTopBar from "./MobileTopBar";
import WorkspaceMenu from "./WorkspaceMenu";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();

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
