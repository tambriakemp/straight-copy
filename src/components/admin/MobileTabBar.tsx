import { Link, useLocation } from "react-router-dom";
import { Home, CreditCard, FileSignature, Megaphone, User } from "lucide-react";

const tabs = [
  { to: "/admin", label: "Home", icon: Home, exact: true },
  { to: "/admin/payments", label: "Payments", icon: CreditCard },
  { to: "/admin/proposals", label: "Proposals", icon: FileSignature },
  { to: "/admin/social", label: "Social", icon: Megaphone },
  { to: "/admin/profile", label: "Profile", icon: User },
];

export default function MobileTabBar() {
  const loc = useLocation();
  const isActive = (to: string, exact?: boolean) =>
    exact ? loc.pathname === to : loc.pathname === to || loc.pathname.startsWith(to + "/") || loc.pathname.startsWith(to);

  return (
    <nav className="m-tabbar" aria-label="Primary">
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = isActive(t.to, t.exact);
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`m-tabbar__item ${active ? "m-tabbar__item--active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon strokeWidth={1.5} />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
