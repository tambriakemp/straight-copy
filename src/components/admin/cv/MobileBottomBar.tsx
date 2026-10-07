import { Link, useLocation } from "react-router-dom";
import { CV_MOBILE_BOTTOM_NAV, isCvNavActive } from "@/lib/adminNav";

export default function MobileBottomBar() {
  const loc = useLocation();
  const isActive = (to: string) => isCvNavActive(loc.pathname, to);

  return (
    <nav className="cv-mobile-bottombar" aria-label="Primary">
      {CV_MOBILE_BOTTOM_NAV.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`cv-mobile-bottombar__item ${active ? "cv-mobile-bottombar__item--active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} strokeWidth={1.75} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
