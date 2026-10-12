import { CSSProperties, ReactNode } from "react";

// One surface left: the Marketing page, whose SocialTab is still a
// dark .crm-shell component rendered inside the light .cv-admin shell.
// (The client-detail tabs that used this have all been rebuilt, and
// ClientPortalActions, one of the three named here originally, is
// deleted.) Those components' CSS (e.g. .detail__portal-btn--ghost) sets text and
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
