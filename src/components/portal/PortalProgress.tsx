// How far through the review the client is, in the page header.
//
// The number that answers the only question a client actually has when they
// land here: is there anything left for me to do? It sits beside the project
// name rather than inside the preview panel, because "one of eight" is the
// reason to scroll, not something you find after scrolling.
import { T } from "@/lib/cre8Design";

export default function PortalProgress({ approved, total }: { approved: number; total: number }) {
  if (!total) return null;
  const pct = Math.round((approved / total) * 100);
  return (
    <div style={{ minWidth: 220 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
        <span style={{ fontSize: 14, color: T.muted }}>Pages approved</span>
        <span style={{ fontSize: 14, color: T.text2 }}>{approved} of {total}</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={approved}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Pages approved"
        style={{ height: 6, borderRadius: 9, background: T.rowActive, overflow: "hidden" }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: T.bronze, borderRadius: 9 }} />
      </div>
    </div>
  );
}
