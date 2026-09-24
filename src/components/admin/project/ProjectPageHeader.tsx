// The project page's masthead, as the canvas draws it.
//
// Back link, type eyebrow, serif name, who it is for — then the three things
// you reach for from anywhere on the page: is it live, what the client sees,
// and the settings that gate both.
import { ArrowLeft, Settings } from "lucide-react";
import { T } from "./projectPageTokens";
import { Pill } from "./PanelChrome";

const STATUS_STYLE: Record<string, { fg: string; bg: string; label: string }> = {
  active: { fg: T.green, bg: T.greenBg, label: "Active" },
  paused: { fg: T.amber, bg: T.amberBg, label: "Paused" },
  complete: { fg: T.text2, bg: T.rowActive, label: "Complete" },
  archived: { fg: T.muted, bg: T.rowActive, label: "Archived" },
};

export default function ProjectPageHeader({
  typeLabel, name, clientName, clientEmail, status, backLabel, onBack, onSettings,
}: {
  typeLabel: string;
  name: string;
  clientName: string | null;
  clientEmail?: string | null;
  status: string;
  backLabel: string;
  onBack: () => void;
  onSettings: () => void;
}) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.active;

  return (
    <header style={{ marginBottom: 22 }}>
      <button
        type="button" onClick={onBack}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7, background: "none",
          border: "none", padding: 0, cursor: "pointer", color: T.muted, fontSize: 14,
        }}
      >
        <ArrowLeft size={14} /> {backLabel}
      </button>

      <div style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        gap: 20, marginTop: 14, flexWrap: "wrap",
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 14, letterSpacing: "1.68px", textTransform: "uppercase", color: T.bronze,
          }}>
            {typeLabel}
          </div>
          <h1 style={{
            fontFamily: T.serif, fontSize: 34, fontWeight: 500, color: T.text,
            margin: "2px 0 0", lineHeight: 1.1,
          }}>
            {name}
          </h1>
          <div style={{ fontSize: 14, color: T.muted, marginTop: 4 }}>
            {[clientName, clientEmail].filter(Boolean).join(" · ") || "No contact on file"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Pill fg={s.fg} bg={s.bg}>{s.label}</Pill>
          <button
            type="button" onClick={onSettings} title="Project settings" aria-label="Project settings"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: T.radiusSm, border: T.hairline,
              background: "transparent", color: T.text2, cursor: "pointer",
            }}
          >
            <Settings size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}
