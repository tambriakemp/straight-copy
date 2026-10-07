import { ReactNode } from "react";
import SideNav from "./SideNav";
import TopBar from "./TopBar";
import MobileTopBar from "./MobileTopBar";
import MobileBottomBar from "./MobileBottomBar";

// The new light side-nav shell (CRE-332), switched in by the
// useNewAdminLayout() toggle on /admin/profile. Existing pages render
// unchanged inside .crm-shell--embedded — see the comment on that class in
// index.css — until each one migrates to .cv-admin of its own accord.
export default function AdminShell({ isMobile, children }: { isMobile: boolean; children: ReactNode }) {
  if (isMobile) {
    return (
      <div className="cv-admin">
        <div className="cv-shell" style={{ flexDirection: "column" }}>
          <MobileTopBar />
          <div className="cv-content">
            <div className="crm-shell crm-shell--embedded">
              <div className="crm-page">{children}</div>
            </div>
          </div>
          <MobileBottomBar />
        </div>
      </div>
    );
  }

  return (
    <div className="cv-admin">
      <div className="cv-shell">
        <SideNav />
        <div className="cv-main">
          <TopBar />
          <div className="cv-content">
            <div className="crm-shell crm-shell--embedded">
              <div className="crm-page">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
