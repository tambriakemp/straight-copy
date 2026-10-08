import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { CV_MOBILE_DRAWER_NAV, CV_ADMIN_NAV, isCvNavActive } from "@/lib/adminNav";

export default function MobileTopBar() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAdminAuth();

  const isActive = (to: string) => isCvNavActive(loc.pathname, to);

  // More-hub items (Agents, Tasks, Ventures...) belong behind the More tab
  // already on the bottom bar — the drawer only needs to cover the Work
  // items that didn't make the bottom bar's five slots.
  const moreSection = CV_ADMIN_NAV.find((s) => s.title === "Workspace")?.items ?? [];

  return (
    <header className="cv-mobile-topbar">
      <button type="button" className="cv-mobile-topbar__btn" onClick={() => setOpen(true)} aria-label="Menu">
        <Menu size={20} strokeWidth={1.75} />
      </button>
      <span className="cv-mobile-topbar__brand">Cre8 Visions</span>
      <span className="cv-mobile-topbar__right">
        <button
          type="button"
          className="cv-mobile-topbar__btn"
          onClick={() => toast("Coming in a later phase of the admin redesign.")}
          aria-label="Notifications"
        >
          <Bell size={18} strokeWidth={1.75} />
        </button>
      </span>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="cv-admin" style={{ background: "var(--cv-card)", width: 260 }}>
          <SheetHeader>
            <SheetTitle className="cv-sidenav__brand-name">Cre8 Visions</SheetTitle>
          </SheetHeader>
          <div style={{ marginTop: 16 }}>
            <div className="cv-sidenav__section-title">Work</div>
            {CV_MOBILE_DRAWER_NAV.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={`cv-sidenav__item ${active ? "cv-sidenav__item--active" : ""}`}
                >
                  <Icon size={17} strokeWidth={1.75} />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            <div className="cv-sidenav__section-title" style={{ marginTop: 16 }}>Workspace</div>
            {moreSection.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.to} to={item.to} onClick={() => setOpen(false)} className="cv-sidenav__item">
                  <Icon size={17} strokeWidth={1.75} />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            <button
              type="button"
              className="cv-sidenav__item"
              style={{ width: "100%", border: 0, background: "none", cursor: "pointer", marginTop: 16, borderTop: "1px solid var(--cv-border)", paddingTop: 16 }}
              onClick={() => { setOpen(false); signOut(); navigate("/admin/login"); }}
            >
              <LogOut size={17} strokeWidth={1.75} />
              <span>Sign out</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
