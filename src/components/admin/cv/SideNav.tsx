import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Settings2 } from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { CV_ADMIN_NAV, isCvNavActive } from "@/lib/adminNav";

export default function SideNav() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAdminAuth();
  const [meOpen, setMeOpen] = useState(false);
  const meRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  // Closing is delayed and cancellable. Even with no gap left to cross,
  // a pointer moving diagonally clips the corner for a frame, and a menu
  // that vanishes mid-reach cannot be clicked at all.
  const openMe = () => {
    if (closeTimer.current) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    setMeOpen(true);
  };
  const closeMeSoon = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setMeOpen(false), 180);
  };
  useEffect(() => () => { if (closeTimer.current) window.clearTimeout(closeTimer.current); }, []);

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

      {/* No Account section. Profile, Settings and Keys are one page
          reached from the avatar below — three nav rows for one
          destination, under a heading, were more chrome than the thing
          they pointed at. The footer already carries margin-top: auto,
          so it sits at the bottom on its own; a spacer here would split
          the free space with it and leave the footer halfway up. */}
      <div
        className="cv-sidenav__footer cv-sidenav__me"
        ref={meRef}
        onMouseEnter={openMe}
        onMouseLeave={closeMeSoon}
      >
        {meOpen && (
          <div className="cv-sidenav__memenu">
            <div className="cv-sidenav__memenu-card" role="menu">
              <Link className="cv-sidenav__meitem" role="menuitem" to="/admin/settings"
                onClick={() => setMeOpen(false)}>
                <Settings2 size={15} /> Profile &amp; settings
              </Link>
              <button type="button" className="cv-sidenav__meitem" role="menuitem"
                onClick={() => { signOut(); navigate("/admin/login"); }}>
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          className="cv-sidenav__avatar"
          aria-haspopup="menu"
          aria-expanded={meOpen}
          aria-label="Profile and settings"
          onFocus={openMe}
          onClick={() => setMeOpen((v) => !v)}
          style={{ border: 0, cursor: "pointer", fontFamily: "inherit" }}
        >
          {initial}
        </button>
        {/* The name, and nothing else. "Profile & settings" was printed
            here AND in the menu this opens AND in the Account section
            above — three of the same words in one corner. */}
        <span style={{ minWidth: 0, flex: 1 }}>
          <div className="cv-sidenav__footer-name" style={{ textTransform: "capitalize" }}>{name}</div>
          <div className="cv-sidenav__footer-sub">{user?.email ?? ""}</div>
        </span>
      </div>
    </nav>
  );
}
