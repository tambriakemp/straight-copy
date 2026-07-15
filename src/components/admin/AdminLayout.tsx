import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import MobileTabBar from "./MobileTabBar";
import MobileTopBar from "./MobileTopBar";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAdminAuth();
  const loc = useLocation();
  const isMobile = useIsMobile();

  const nav = [
    { to: "/admin", label: "◆ Dashboard", exact: true },
    { to: "/admin/clients", label: "▦ Clients" },
    { to: "/admin/tasks", label: "✓ Tasks" },
    { to: "/admin/wiki", label: "❒ Knowledge Base" },
    { to: "/admin/invites", label: "✉ Invites" },
    { to: "/admin/tokens", label: "⚙ Settings" },
    { to: "/admin/profile", label: "◐ Profile" },
  ];

  const isActive = (to: string, exact?: boolean) =>
    exact ? loc.pathname === to : loc.pathname.startsWith(to);

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
      <nav className="topnav">
        <div className="topnav__left">
          <Link to="/admin" className="topnav__wordmark">
            Cre8<span className="dot">·</span>CRM
          </Link>
          <div className="topnav__nav">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`topnav__item ${isActive(n.to, n.exact) ? "topnav__item--active" : ""}`}
              >
                {n.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="topnav__right">
          <button className="topnav__signout" onClick={signOut}>
            ⎋ Sign out
          </button>
        </div>
      </nav>

      <div className="crm-page">{children}</div>
    </div>
  );
}
