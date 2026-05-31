import { formatDistanceToNow } from "date-fns";
import type { SocialBatch } from "./SocialTab";

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  drafting: { bg: "hsl(40 20% 97% / 0.08)", color: "hsl(40 60% 75%)", label: "Drafting" },
  ready_for_review: { bg: "hsl(200 60% 30% / 0.18)", color: "hsl(200 80% 75%)", label: "Ready for review" },
  approved: { bg: "hsl(120 30% 30% / 0.18)", color: "hsl(120 50% 75%)", label: "Approved" },
  publishing: { bg: "hsl(40 60% 30% / 0.18)", color: "hsl(40 80% 75%)", label: "Publishing" },
  published: { bg: "hsl(140 40% 30% / 0.2)", color: "hsl(140 60% 75%)", label: "Published" },
  error: { bg: "hsl(0 40% 30% / 0.2)", color: "hsl(0 70% 75%)", label: "Error" },
};

export default function BatchList({
  batches, loading, onOpen,
}: {
  batches: SocialBatch[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  if (loading) return <div style={{ color: "var(--crm-taupe)", padding: 16 }}>Loading…</div>;
  if (!batches.length) {
    return (
      <div style={{
        border: "1px dashed var(--crm-border-dark)", borderRadius: 12, padding: 32,
        textAlign: "center", color: "var(--crm-taupe)",
      }}>
        No batches yet. Start by creating one.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {batches.map((b) => {
        const s = STATUS_STYLES[b.status] ?? STATUS_STYLES.drafting;
        return (
          <button
            key={b.id}
            onClick={() => onOpen(b.id)}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto auto",
              gap: 16, alignItems: "center",
              padding: "14px 18px",
              border: "1px solid var(--crm-border-dark)",
              borderRadius: 10,
              background: "transparent",
              cursor: "pointer",
              textAlign: "left",
              color: "var(--crm-warm-white)",
            }}
          >
            <div>
              <div style={{ fontSize: 15, color: "var(--crm-warm-white)", marginBottom: 4 }}>
                {b.brief?.slice(0, 80) || `${b.single_count + b.carousel_count} posts`}
                {b.brief && b.brief.length > 80 ? "…" : ""}
              </div>
              <div style={{ fontSize: 12, color: "var(--crm-taupe)", display: "flex", gap: 12 }}>
                <span>{b.single_count} single · {b.carousel_count} carousel</span>
                {b.platform && <span>· {b.platform}</span>}
                <span>· {formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}</span>
              </div>
            </div>
            <span style={{
              fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
              padding: "4px 10px", borderRadius: 999,
              background: s.bg, color: s.color,
            }}>
              {s.label}
            </span>
            <span style={{ color: "var(--crm-taupe)", fontSize: 18 }}>→</span>
          </button>
        );
      })}
    </div>
  );
}
