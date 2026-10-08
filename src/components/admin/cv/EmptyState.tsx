import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

export default function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="cv-empty">
      {Icon && <Icon size={32} strokeWidth={1.5} className="cv-empty__icon" />}
      <div className="cv-empty__title">{title}</div>
      {subtitle && <div className="cv-empty__subtitle">{subtitle}</div>}
      {action}
    </div>
  );
}
