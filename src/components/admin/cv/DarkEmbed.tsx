import { CSSProperties, ReactNode } from "react";

// A handful of Phase 4 client-detail tabs reuse existing dark-themed
// .crm-shell components (ClientsTable, ProjectTasksPanel, ClientPortalActions)
// as fragments inside the new light .cv-admin page, rather than rebuilding
// them. Those components' CSS (e.g. .detail__portal-btn--ghost) sets text and
// border colors meant to read against the dark .crm-ink background every
// other .crm-shell page gives them for free — nested bare inside .cv-admin's
// light background, that text is near-invisible. This gives the fragment its
// own small dark surface so it stays exactly as legible as it is today,
// instead of inheriting a "not yet migrated" light-on-light look nobody
// asked for. Not the heavier .crm-shell/.crm-page flex wrapper (its `flex: 1`
// fights for space in a header's inline icon row) — a plain dark card is
// enough for these.
export default function DarkEmbed({
  children, style, inline = false,
}: { children: ReactNode; style?: CSSProperties; inline?: boolean }) {
  return (
    <div
      style={{
        background: "hsl(40 8% 10%)",
        borderRadius: "var(--cv-r-sm)",
        display: inline ? "inline-flex" : "block",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
