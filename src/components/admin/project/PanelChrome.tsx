// The panel the canvas draws everything in: a hairline box with a serif title,
// optional meta, and actions pushed to the right of a 14/18 header bar.
//
// One implementation so Preview, Proposal and Payments cannot drift into three
// slightly different boxes — which is what happened last time each panel
// styled its own heading.
import { T } from "@/lib/cre8Design";

export function PanelButton({
  primary, onClick, disabled, children, title, type = "button",
}: {
  primary?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type} onClick={onClick} disabled={disabled} title={title}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        fontSize: 14, fontWeight: 500, padding: "7px 13px", borderRadius: T.radiusSm,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1,
        border: primary ? "none" : T.hairline,
        background: primary ? T.text : "transparent",
        color: primary ? "rgb(27, 25, 21)" : T.text,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export function Pill({ fg, bg, dot = true, children }: {
  fg: string; bg: string; dot?: boolean; children: React.ReactNode;
}) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 500,
      color: fg, background: bg, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap",
    }}>
      {dot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: fg }} />}
      {children}
    </span>
  );
}

export default function Panel({
  title, meta, actions, children, style,
}: {
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section style={{
      border: T.hairline, borderRadius: T.radius, background: T.panel,
      display: "flex", flexDirection: "column", minWidth: 0, ...style,
    }}>
      <header style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
        borderBottom: T.hairline, flexWrap: "wrap",
      }}>
        <h2 style={{ fontFamily: T.serif, fontSize: 22, fontWeight: 500, color: T.text, margin: 0 }}>
          {title}
        </h2>
        {meta}
        {actions && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            {actions}
          </div>
        )}
      </header>
      {children}
    </section>
  );
}
