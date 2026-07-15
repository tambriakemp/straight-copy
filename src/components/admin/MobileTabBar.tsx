import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, CheckSquare, BookOpen, User } from "lucide-react";

const tabs = [
  { to: "/admin", label: "Home", icon: LayoutDashboard, exact: true },
  { to: "/admin/clients", label: "Clients", icon: Users },
  { to: "/admin/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/admin/wiki", label: "Wiki", icon: BookOpen },
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
