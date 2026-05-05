import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAdminAuth } from "@/hooks/useAdminAuth";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { signOut, user } = useAdminAuth();
  const loc = useLocation();

  const nav = [
    { to: "/admin", label: "▦ Clients", exact: true },
    { to: "/admin/invites", label: "✉ Invites" },
    { to: "/admin/previews", label: "▤ Previews" },
    { to: "/admin/tokens", label: "⌁ API Tokens" },
    { to: "/admin/profile", label: "◐ Profile" },
  ];

  const isActive = (to: string, exact?: boolean) =>
    exact ? loc.pathname === to : loc.pathname.startsWith(to);

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
