import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { CV_ADMIN_NAV, isCvNavActive } from "@/lib/adminNav";

export default function SideNav() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAdminAuth();

  const isActive = (to: string) => isCvNavActive(loc.pathname, to);

  const initial = (user?.email?.[0] ?? "B").toUpperCase();
  const name = user?.email?.split("@")[0] ?? "Bree";

  return (
    <nav className="cv-sidenav" aria-label="Primary">
      <Link to="/admin/today" className="cv-sidenav__brand">
        <span className="cv-sidenav__brand-mark">C</span>
        <span>
          <div className="cv-sidenav__brand-name">Cre8 Visions</div>
          <div className="cv-sidenav__brand-sub">Admin</div>
        </span>
      </Link>

      {CV_ADMIN_NAV.map((section) => (
        <div className="cv-sidenav__section" key={section.title}>
          <div className="cv-sidenav__section-title">{section.title}</div>
          {section.items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`cv-sidenav__item ${active ? "cv-sidenav__item--active" : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={17} strokeWidth={1.75} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}

      <div className="cv-sidenav__footer">
        <span className="cv-sidenav__avatar">{initial}</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <div className="cv-sidenav__footer-name" style={{ textTransform: "capitalize" }}>{name}</div>
          <button
            type="button"
            className="cv-sidenav__footer-link"
            onClick={() => navigate("/admin/profile")}
          >
            Profile
          </button>
          {" · "}
          <button type="button" className="cv-sidenav__footer-link" onClick={() => { signOut(); navigate("/admin/login"); }}>
            Sign out
          </button>
        </span>
      </div>
    </nav>
  );
}
