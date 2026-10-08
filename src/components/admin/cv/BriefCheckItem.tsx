import { ReactNode, useState } from "react";
import { Check, RotateCcw } from "lucide-react";

/**
 * Checkbox row shared by the Today page and /admin/briefs (CRE-335) for
 * both "Needs you now" items and morning-brief lines: a small checkbox that
 * strikes the row and shows Undo once checked. The caller owns what "done"
 * means (a brief_item_completions row) and what firing the check actually
 * does (complete-brief-item posts the Ara webhook); this component is
 * presentation only.
 */
export default function BriefCheckItem({
  done,
  onComplete,
  onUndo,
  children,
  borderColor = "var(--cv-border, #d8d3c8)",
  mutedColor = "var(--cv-muted, #8a8275)",
}: {
  done: boolean;
  onComplete: () => Promise<boolean> | boolean;
  onUndo: () => Promise<boolean> | boolean;
  children: ReactNode;
  borderColor?: string;
  mutedColor?: string;
}) {
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await (done ? onUndo() : onComplete());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, width: "100%" }}>
      <button
        type="button"
        aria-label={done ? "Mark not done" : "Mark done"}
        disabled={busy}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
        style={{
          flexShrink: 0, width: 16, height: 16, marginTop: 3, borderRadius: 4,
          border: `1px solid ${borderColor}`,
          background: done ? "#1a7f44" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: busy ? "default" : "pointer", padding: 0,
        }}
      >
        {done && <Check size={11} color="#fff" strokeWidth={3} />}
      </button>
      <span style={{ flex: 1, minWidth: 0, textDecoration: done ? "line-through" : "none", opacity: done ? 0.55 : 1 }}>
        {children}
      </span>
      {done && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
          disabled={busy}
          style={{
            flexShrink: 0, background: "none", border: "none", cursor: busy ? "default" : "pointer",
            color: mutedColor, padding: 0, display: "flex",
            alignItems: "center", gap: 3, fontSize: 12, whiteSpace: "nowrap",
          }}
          aria-label="Undo"
        >
          <RotateCcw size={11} /> Undo
        </button>
      )}
    </div>
  );
}
