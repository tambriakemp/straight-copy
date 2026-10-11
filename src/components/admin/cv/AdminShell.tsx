import { ReactNode } from "react";
import SideNav from "./SideNav";
import TopBar from "./TopBar";
import MobileTopBar from "./MobileTopBar";
import MobileBottomBar from "./MobileBottomBar";

// The admin shell (CRE-332) — the only admin layout since Phase 7. Pages
// that haven't migrated to .cv-admin of their own accord still render
// unchanged inside .crm-shell--embedded — see the comment on that class in
// index.css.
/**
 * @param topBar Search / notifications / New. Off on Today, which opens
 *   with its own header and the brief — a second bar above that one puts a
 *   search box between you and the first thing you came to read.
 */
export default function AdminShell({
  isMobile, children, topBar = true,
}: { isMobile: boolean; children: ReactNode; topBar?: boolean }) {
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
          {topBar && <TopBar />}
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
