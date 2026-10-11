import { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Card from "./Card";

// CRE-388: Bree's complaint was that section titles "get lost" and she
// can't tell where one section starts or stops on the Today page. Every
// center/sidebar section now wraps in this — a bordered card with its own
// header bar (icon + title + optional count badge) instead of a bare
// uppercase label floating inside one giant shared card.
export default function SectionCard({
  icon: Icon,
  title,
  count,
  right,
  children,
}: {
  icon: LucideIcon;
  title: ReactNode;
  count?: number;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="cv-card-pad cv-section">
      <div className="cv-section__head">
        <div className="cv-section__title">
          <span className="cv-section__icon"><Icon size={14} /></span>
          <span>{title}</span>
          {typeof count === "number" && <span className="cv-section__count">{count}</span>}
        </div>
        {right}
      </div>
      <div className="cv-section__body">{children}</div>
    </Card>
  );
}
