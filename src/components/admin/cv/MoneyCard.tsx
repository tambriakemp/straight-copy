import { ArrowDown, ArrowDownRight, ArrowUpRight, CalendarClock, DollarSign, FileText, Minus, Sparkles, type LucideIcon } from "lucide-react";
import type { MoneyStatCard, MoneyStats, MoneyTrend } from "@/lib/briefs";
import { LinkifiedText } from "./IssueLinks";

// CRE-366: Money is data-only — no checkbox on any of it (Bree's change to
// the mockup, §2a). Nothing here writes anything back.

interface Accent { tint: string; border: string; iconBg: string; iconFg: string; icon: LucideIcon }
const CARD_ACCENT: Record<string, Accent> = {
  deposits_week: { tint: "#f2fbf8", border: "#d7efe9", iconBg: "#e6f6f3", iconFg: "#0f766e", icon: ArrowDown },
  unpaid_invoices: { tint: "#f8f8fb", border: "#eef0f3", iconBg: "#f3f4f6", iconFg: "#4b5563", icon: FileText },
  upcoming_payments: { tint: "#f5f6ff", border: "#e3e6ff", iconBg: "#eef0ff", iconFg: "#4338ca", icon: CalendarClock },
};
const DEFAULT_ACCENT: Accent = { tint: "#ffffff", border: "#eef0f3", iconBg: "#f3f4f6", iconFg: "#4b5563", icon: DollarSign };

const TREND_ICON: Record<MoneyTrend, LucideIcon> = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus, new: Sparkles };
const TREND_TONE: Record<MoneyTrend, { fg: string; bg: string }> = {
  up: { fg: "#15803d", bg: "#effaf3" },
  down: { fg: "#b91c1c", bg: "#fdecea" },
  flat: { fg: "#6b7280", bg: "#f3f4f6" },
  new: { fg: "#4338ca", bg: "#eef0ff" },
};

function MoneyStatTile({ card }: { card: MoneyStatCard }) {
  const accent = CARD_ACCENT[card.id] ?? DEFAULT_ACCENT;
  const Icon = accent.icon;
  const TrendIcon = card.trend ? TREND_ICON[card.trend] : null;
  const tone = card.trend ? TREND_TONE[card.trend] : null;
  return (
    <div className="cv-money__stat" style={{ background: `linear-gradient(180deg, ${accent.tint} 0%, #fff 70%)`, borderColor: accent.border }}>
      <div className="cv-money__lbl">
        <span className="cv-money__ibox" style={{ background: accent.iconBg, color: accent.iconFg }}><Icon size={13} /></span>
        {card.label}
      </div>
      <div className="cv-money__val"><b>{card.display}</b></div>
      {TrendIcon && tone && (
        <div className="cv-money__trend" style={{ color: tone.fg, background: tone.bg }}>
          <TrendIcon size={12} />{card.trend_label ?? card.trend}
        </div>
      )}
      {card.lines && card.lines.length > 0 && (
        <div className="cv-money__sub">
          {card.lines.map((line, i) => (
            <div key={i} className={i > 0 ? "cv-money__sub-muted" : undefined}><LinkifiedText text={line} /></div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MoneyCard({ stats }: { stats: MoneyStats }) {
  if (!stats.cards?.length) return null;
  return (
    <div className="cv-money">
      <div className="cv-money__head">
        <div>
          <div className="cv-money__eyebrow">Money</div>
          <div className="cv-money__title">
            <h3>This week</h3>
            {stats.range_label && <span className="cv-money__range">{stats.range_label}</span>}
          </div>
        </div>
        {stats.source_label && <div className="cv-money__source">{stats.source_label}</div>}
      </div>
      <div className="cv-money__grid">
        {stats.cards.map((card) => <MoneyStatTile key={card.id} card={card} />)}
      </div>
      {stats.note && <div className="cv-money__footnote"><b>Overnight</b> <LinkifiedText text={stats.note} /></div>}
    </div>
  );
}
