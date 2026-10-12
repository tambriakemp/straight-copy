import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Settings2 } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { CV_ADMIN_NAV, CV_ADMIN_ACCOUNT_NAV, isCvNavActive } from "@/lib/adminNav";

export default function SideNav() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAdminAuth();
  const [meOpen, setMeOpen] = useState(false);
  const meRef = useRef<HTMLDivElement>(null);

  const isActive = (to: string) => isCvNavActive(loc.pathname, to, loc.search);

  const initial = (user?.email?.[0] ?? "B").toUpperCase();
  const name = user?.email?.split("@")[0] ?? "Bree";

  // Hover opens it; a click outside or Escape closes it. Pointer-only
  // would strand anyone on a keyboard, so the avatar is a button and
  // focus opens it too.
  useEffect(() => {
    if (!meOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!meRef.current?.contains(e.target as Node)) setMeOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMeOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [meOpen]);

  const section = (title: string, items: typeof CV_ADMIN_NAV[number]["items"]) => (
    <div className="cv-sidenav__section" key={title}>
      <div className="cv-sidenav__section-title">{title}</div>
      {items.map((item) => {
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
  );

  return (
    <nav className="cv-sidenav" aria-label="Primary">
      <Link to="/admin/today" className="cv-sidenav__brand">
        <span className="cv-sidenav__brand-mark">C</span>
        <span>
          <div className="cv-sidenav__brand-name">Cre8 Visions</div>
          <div className="cv-sidenav__brand-sub">Admin</div>
        </span>
      </Link>

      {CV_ADMIN_NAV.map((s) => section(s.title, s.items))}

      {/* Pinned to the bottom, above the avatar: settings are the things
          you reach for least often and should not sit among the things
          you reach for all day. */}
      <div style={{ marginTop: "auto" }}>
        {section(CV_ADMIN_ACCOUNT_NAV.title, CV_ADMIN_ACCOUNT_NAV.items)}
      </div>

      <div
        className="cv-sidenav__footer cv-sidenav__me"
        ref={meRef}
        onMouseEnter={() => setMeOpen(true)}
        onMouseLeave={() => setMeOpen(false)}
      >
        {meOpen && (
          <div className="cv-sidenav__memenu" role="menu">
            <Link className="cv-sidenav__meitem" role="menuitem" to="/admin/settings"
              onClick={() => setMeOpen(false)}>
              <Settings2 size={15} /> Profile &amp; settings
            </Link>
            <button type="button" className="cv-sidenav__meitem" role="menuitem"
              onClick={() => { signOut(); navigate("/admin/login"); }}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
        )}

        <button
          type="button"
          className="cv-sidenav__avatar"
          aria-haspopup="menu"
          aria-expanded={meOpen}
          aria-label="Profile and settings"
          onFocus={() => setMeOpen(true)}
          onClick={() => setMeOpen((v) => !v)}
          style={{ border: 0, cursor: "pointer", fontFamily: "inherit" }}
        >
          {initial}
        </button>
        <span style={{ minWidth: 0, flex: 1 }}>
          <div className="cv-sidenav__footer-name" style={{ textTransform: "capitalize" }}>{name}</div>
          <button
            type="button"
            className="cv-sidenav__footer-link"
            onClick={() => navigate("/admin/settings")}
          >
            Profile &amp; settings
          </button>
        </span>
      </div>
    </nav>
  );
}
