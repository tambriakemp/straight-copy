import { ReactNode } from "react";
import Card from "./Card";

function KpiInner({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <>
      <div className="cv-kpi__label">{label}</div>
      <div className="cv-kpi__value">{value}</div>
      {hint && <div className="cv-kpi__hint">{hint}</div>}
    </>
  );
}

export default function KpiCard({
  label, value, hint, onClick,
}: { label: string; value: ReactNode; hint?: ReactNode; onClick?: () => void }) {
  if (onClick) {
    return (
      <button type="button" className="cv-card cv-kpi" onClick={onClick}>
        <KpiInner label={label} value={value} hint={hint} />
      </button>
    );
  }
  return (
    <Card className="cv-kpi">
      <KpiInner label={label} value={value} hint={hint} />
    </Card>
  );
}
