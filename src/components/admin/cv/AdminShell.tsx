import { ReactNode } from "react";
import SideNav from "./SideNav";
import TopBar from "./TopBar";
import MobileTopBar from "./MobileTopBar";
import MobileBottomBar from "./MobileBottomBar";

// The admin shell (CRE-332) — the only admin layout since Phase 7. Pages
// that haven't migrated to .cv-admin of their own accord still render
// unchanged inside .crm-shell--embedded — see the comment on that class in
// index.css.
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
