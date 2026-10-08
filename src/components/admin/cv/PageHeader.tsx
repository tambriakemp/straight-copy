import { ReactNode } from "react";

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="cv-page-header">
      <div className="cv-page-header__row" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          {eyebrow && <div className="cv-page-header__eyebrow">{eyebrow}</div>}
          <h1 className="cv-page-header__title">{title}</h1>
          {subtitle && <p className="cv-page-header__subtitle">{subtitle}</p>}
        </div>
        {right && <div style={{ flexShrink: 0 }}>{right}</div>}
      </div>
    </div>
  );
}
