// Shared admin dashboard primitives.
//
// These were local to src/pages/admin/AdminDashboard.tsx; extracted verbatim so
// the venture pages render identically to the rest of the CRM. Styling stays
// inline on the var(--crm-*) tokens defined in src/index.css — this admin
// surface deliberately does not use the shadcn card primitives.
import React from "react";

export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);

export function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function dueLabel(iso: string | null) {
  if (!iso) return { text: "no date", overdue: false, soon: false };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(iso); due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, overdue: true, soon: false };
  if (diff === 0) return { text: "today", overdue: false, soon: true };
  if (diff === 1) return { text: "tomorrow", overdue: false, soon: true };
  return { text: `in ${diff}d`, overdue: false, soon: diff <= 3 };
}

export function KpiTile({ label, value, sub, tone, loading, onClick }: {
  label: string; value?: number | string; sub?: string; tone?: "danger"; loading?: boolean; onClick?: () => void;
}) {
  const color = tone === "danger" ? "#e07a5f" : "var(--crm-warm-white)";
  return (
    <button onClick={onClick} disabled={!onClick}
      style={{ padding: "16px 18px", background: "var(--crm-charcoal)", border: "1px solid var(--crm-border-dark)", borderRadius: 10,
        textAlign: "left", cursor: onClick ? "pointer" : "default", color: "var(--crm-warm-white)" }}>
      <div style={{ fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>{label}</div>
      <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 38, lineHeight: 1.1, marginTop: 6, color }}>
        {loading ? "—" : (value ?? 0)}
      </div>
      {sub && <div style={{ fontSize: 13, color: "var(--crm-taupe)", marginTop: 2 }}>{sub}</div>}
    </button>
  );
}

export function RevenueCard({ label, amount, tone, loading, note, onClick }: {
  label: string; amount: number; tone?: "warn" | "accent"; loading?: boolean; note?: string; onClick?: () => void;
}) {
  const color = tone === "warn" ? "#dbb172" : tone === "accent" ? "#9db8a6" : "var(--crm-warm-white)";
  return (
    <div onClick={onClick}
      style={{ padding: "20px 22px", background: "var(--crm-charcoal)", border: "1px solid var(--crm-border-dark)", borderRadius: 10,
        cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>{label}</div>
      <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 46, lineHeight: 1.1, marginTop: 6, color }}>
        {loading ? "—" : money(amount)}
      </div>
      {/* `note` is how MRR states that it is a run-rate and not collected cash. */}
      {note && <div style={{ fontSize: 13, color: "var(--crm-taupe)", marginTop: 4, fontStyle: "italic" }}>{note}</div>}
    </div>
  );
}

export function Section({ title, children, actionLabel, onAction }: {
  title: string; children: React.ReactNode; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div style={{ fontSize: 13, letterSpacing: "0.35em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>{title}</div>
        {actionLabel && <button onClick={onAction} className="crm-btn crm-btn--ghost" style={{ fontSize: 13 }}>{actionLabel}</button>}
      </div>
      <div style={{ border: "1px solid var(--crm-border-dark)", borderRadius: 10, overflow: "hidden" }}>{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "20px 14px", color: "var(--crm-taupe)", fontSize: 15, textAlign: "center" }}>{children}</div>;
}

/** Goal-vs-actual bar used by launch cards. */
export function GoalBar({ actual, goal, tone = "#9db8a6" }: { actual: number; goal?: number | null; tone?: string }) {
  const pct = goal && goal > 0 ? Math.min(100, Math.round((actual / goal) * 100)) : null;
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ height: 4, background: "var(--crm-border-dark)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct ?? 0}%`, background: tone, transition: "width 200ms" }} />
      </div>
      <div style={{ fontSize: 13, color: "var(--crm-taupe)", marginTop: 4 }}>
        {pct === null ? "no goal set" : `${pct}% of goal`}
      </div>
    </div>
  );
}
