import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";

/**
 * Bare check-off control sharing BriefCheckItem's visuals and the same
 * complete-brief-item flow (CRE-366 §2a), for cards whose layout doesn't fit
 * BriefCheckItem's "checkbox + single text row" shape — the Money section
 * has none of these (it's data-only, no checkbox at all), everything else
 * (pipeline cards, done items, approvals) does.
 */
export default function CvCheckbox({
  done,
  onComplete,
  onUndo,
  showUndo = true,
}: {
  done: boolean;
  onComplete: () => Promise<boolean> | boolean;
  onUndo: () => Promise<boolean> | boolean;
  showUndo?: boolean;
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
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
      <button
        type="button"
        aria-label={done ? "Mark not done" : "Mark done"}
        disabled={busy}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
        style={{
          flexShrink: 0, width: 16, height: 16, borderRadius: 5, border: "1.5px solid #c7cbd3",
          background: done ? "#1a7f44" : "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: busy ? "default" : "pointer", padding: 0,
        }}
      >
        {done && <Check size={11} color="#fff" strokeWidth={3} />}
      </button>
      {done && showUndo && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(); }}
          disabled={busy}
          style={{
            flexShrink: 0, background: "none", border: "none", cursor: busy ? "default" : "pointer",
            color: "var(--cv-muted)", padding: 0, display: "flex",
            alignItems: "center", gap: 3, fontSize: 11.5, whiteSpace: "nowrap",
          }}
          aria-label="Undo"
        >
          <RotateCcw size={10} /> Undo
        </button>
      )}
    </span>
  );
}
