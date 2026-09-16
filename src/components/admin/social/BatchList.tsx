// Every batch, as a table under a fold.
//
// Was a list of cards behind a Batches/Images/Templates switcher. The queue
// above answers "is there anything for me to do"; this answers the rarer
// "which batch did that come from", so it opens shut and stays out of the way
// until asked for.
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import type { SocialBatch } from "./SocialTab";
import { BATCH_FILTERS, matchesFilter, type BatchFilter } from "./socialStatus";

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  drafting: { bg: "hsl(40 20% 97% / 0.08)", color: "hsl(40 60% 75%)", label: "Drafting" },
  ready_for_review: { bg: "hsl(200 60% 30% / 0.18)", color: "hsl(200 80% 75%)", label: "Ready for review" },
  approved: { bg: "hsl(120 30% 30% / 0.18)", color: "hsl(120 50% 75%)", label: "Approved" },
  publishing: { bg: "hsl(40 60% 30% / 0.18)", color: "hsl(40 80% 75%)", label: "Publishing" },
  published: { bg: "hsl(140 40% 30% / 0.2)", color: "hsl(140 60% 75%)", label: "Published" },
  error: { bg: "hsl(0 40% 30% / 0.2)", color: "hsl(0 70% 75%)", label: "Error · retry" },
};

const COLS = "1.4fr 1fr 1fr auto";

export default function BatchList({
  batches, loading, onOpen,
}: {
  batches: SocialBatch[];
  loading: boolean;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<BatchFilter>("all");

  const errorCount = useMemo(
    () => batches.filter((b) => b.status === "error").length,
    [batches],
  );
  const shown = useMemo(
    () => batches.filter((b) => matchesFilter(b.status, filter)),
    [batches, filter],
  );

  if (loading) return <div style={{ color: "var(--crm-taupe)", fontSize: 15 }}>Loading batches…</div>;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 12, width: "100%",
          padding: "13px 16px", border: "1px solid var(--crm-border-dark)",
          borderRadius: 6, background: "hsl(40 20% 97% / 0.015)", cursor: "pointer",
          color: "var(--crm-warm-white)", textAlign: "left",
        }}
      >
        <span style={{ fontSize: 13, color: "var(--crm-taupe)", width: 12 }}>{open ? "▾" : "▸"}</span>
        <span style={{ fontSize: 18 }}>All batches</span>
        <span style={{ fontSize: 14, color: "var(--crm-taupe)" }}>{batches.length}</span>
        {errorCount > 0 && (
          <span style={{
            fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
            color: "hsl(0 60% 76%)", background: "hsl(0 40% 25% / 0.5)",
            borderRadius: 999, padding: "3px 9px",
          }}>
            {errorCount} error{errorCount === 1 ? "" : "s"}
          </span>
        )}
        <span style={{ fontSize: 13, color: "var(--crm-taupe)", marginLeft: "auto" }}>
          {open ? "Hide" : "Show"}
        </span>
      </button>

      {open && (
        <>
          <div style={{ display: "flex", gap: 6, fontSize: 13, marginTop: 14, flexWrap: "wrap" }}>
            {BATCH_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-current={filter === f.key}
                style={{
                  borderRadius: 999, padding: "4px 12px", cursor: "pointer",
                  border: "1px solid var(--crm-border-dark)",
                  background: filter === f.key ? "hsl(40 20% 97% / 0.08)" : "transparent",
                  color: filter === f.key ? "var(--crm-warm-white)" : "var(--crm-taupe)",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {!shown.length ? (
            <div style={{
              border: "1px dashed var(--crm-border-dark)", borderRadius: 6, marginTop: 12,
              padding: 24, textAlign: "center", color: "var(--crm-taupe)", fontSize: 15,
            }}>
              {batches.length ? "No batches match that filter." : "No batches yet."}
            </div>
          ) : (
            <>
              <div style={{
                marginTop: 12, border: "1px solid var(--crm-border-dark)", borderRadius: 6,
                overflow: "hidden", maxHeight: 260, overflowY: "auto",
              }}>
                <div style={{
                  display: "grid", gridTemplateColumns: COLS, gap: 16, padding: "10px 18px",
                  background: "hsl(40 20% 97% / 0.04)", borderBottom: "1px solid var(--crm-border-dark)",
                  fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
                  color: "var(--crm-taupe)", position: "sticky", top: 0,
                }}>
                  <span>Batch</span><span>Contents</span><span>Created</span><span>Status</span>
                </div>
                {shown.map((b) => {
                  const s = STATUS_STYLES[b.status] ?? STATUS_STYLES.drafting;
                  const count = b.single_count + b.carousel_count;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onOpen(b.id)}
                      style={{
                        display: "grid", gridTemplateColumns: COLS, gap: 16, alignItems: "center",
                        width: "100%", padding: "16px 18px", textAlign: "left", cursor: "pointer",
                        border: "none", borderBottom: "1px solid var(--crm-border-dark)",
                        background: "transparent", color: "var(--crm-warm-white)",
                      }}
                    >
                      <span style={{ fontSize: 15 }}>
                        {count} post{count === 1 ? "" : "s"}{b.platform ? ` · ${b.platform}` : ""}
                      </span>
                      <span style={{ fontSize: 14, color: "var(--crm-taupe)" }}>
                        {b.single_count} single · {b.carousel_count} carousel
                      </span>
                      <span style={{ fontSize: 14, color: "var(--crm-taupe)" }}>
                        {formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                      </span>
                      <span style={{
                        fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
                        borderRadius: 999, padding: "4px 11px", background: s.bg, color: s.color,
                        whiteSpace: "nowrap",
                      }}>
                        {s.label}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 13, color: "var(--crm-taupe)", marginTop: 10 }}>
                Showing {shown.length} of {batches.length}
                {shown.length < batches.length ? " · filtered" : ""}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
