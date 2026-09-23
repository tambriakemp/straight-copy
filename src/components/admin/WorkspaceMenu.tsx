// Workspace switcher + full navigation, collapsed into one control.
//
// Replaces the row of nine top-level links. Everything is still one click away,
// but the bar itself carries only where you are, not everywhere you could go.
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { NAV, type NavItem } from "@/lib/adminNav";



export default function WorkspaceMenu() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAdminAuth();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape — a menu that traps you is worse than
  // the nav row it replaced.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Navigating always closes it, including on a link to where you already are.
  useEffect(() => { setOpen(false); }, [loc.pathname]);

  const isActive = (n: NavItem) =>
    n.exact ? loc.pathname === n.to : loc.pathname.startsWith(n.to);

  const primary = [
    { to: "/admin", label: "Clients", exact: true },
    { to: "/admin/proposals", label: "Proposals" },
    { to: "/admin/payments", label: "Payments" },
    { to: "/admin/social", label: "Social / Marketing" },
  ];
  const chip = (on: boolean): React.CSSProperties => ({
    padding: "6px 12px", fontSize: 15, letterSpacing: "0.02em",
    border: "1px solid var(--crm-border-dark)", borderRadius: 2,
    textDecoration: "none",
    background: on ? "var(--crm-charcoal)" : "transparent",
    color: on ? "var(--crm-warm-white)" : "var(--crm-taupe)",
  });

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", alignItems: "center", gap: 10 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 9, padding: "6px 10px 6px 6px",
          background: open ? "var(--crm-charcoal)" : "transparent",
          border: "1px solid var(--crm-border-dark)",
          color: "var(--crm-warm-white)", cursor: "pointer", borderRadius: 2,
        }}
      >
        <span style={{
          width: 22, height: 22, display: "grid", placeItems: "center",
          background: "var(--crm-warm-white)", color: "var(--crm-ink)",
          fontFamily: "Cormorant Garamond, serif", fontSize: 16, borderRadius: 2,
        }}>C</span>
        <span style={{ fontSize: 15, letterSpacing: "0.02em" }}>Profile</span>
        <span style={{ fontSize: 11, color: "var(--crm-taupe)", transform: open ? "rotate(180deg)" : "none" }}>▾</span>
      </button>

      {primary.map((item) => {
        const active = item.exact ? loc.pathname === item.to : loc.pathname.startsWith(item.to);
        return <Link key={item.to} to={item.to} style={chip(active)} aria-current={active ? "page" : undefined}>{item.label}</Link>;
      })}

      {open && (
        <div role="menu" style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60,
          minWidth: 250, background: "var(--crm-ink)",
          border: "1px solid var(--crm-border-dark)", padding: "6px 0",
          boxShadow: "0 18px 44px rgba(0,0,0,.5)",
        }}>
          <div>
            <div style={{
              fontSize: 11, letterSpacing: "0.3em", textTransform: "uppercase",
              color: "var(--crm-taupe)", padding: "9px 14px 5px",
            }}>Profile</div>
            {NAV.map((n) => (
                  <Link key={n.to} to={n.to} role="menuitem"
                    style={{
                      display: "grid", gridTemplateColumns: "16px 1fr", gap: 10,
                      alignItems: "center", padding: "7px 14px", fontSize: 15,
                      color: isActive(n) ? "var(--crm-warm-white)" : "var(--crm-taupe)",
                      background: isActive(n) ? "var(--crm-charcoal)" : "transparent",
                    }}>
                    <span style={{ opacity: 0.8 }}>{n.glyph}</span>
                    <span>{n.label}</span>
                  </Link>
            ))}
          </div>

          <div style={{ borderTop: "1px solid var(--crm-border-dark)", marginTop: 6, paddingTop: 4 }}>
            <button
              onClick={() => { setOpen(false); signOut(); navigate("/admin/login"); }}
              style={{
                display: "grid", gridTemplateColumns: "16px 1fr", gap: 10, alignItems: "center",
                width: "100%", padding: "8px 14px", fontSize: 15, textAlign: "left",
                background: "transparent", border: "none", cursor: "pointer", color: "var(--crm-taupe)",
              }}>
              <span style={{ opacity: 0.8 }}>⎋</span>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
