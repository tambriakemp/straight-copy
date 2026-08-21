// A slide-over panel for editing one thing.
//
// Replaces the inline field blocks that grew inside cards. Editing a company
// used to expand four inputs in the middle of a list, pushing everything below
// it down and making the list unreadable while you typed. A panel keeps the
// list still, gives the form room, and makes "I am editing this one thing" a
// state you can see and leave.
//
// Deliberately not the shadcn Dialog: this admin does not use shadcn cards, and
// a centred modal over a list loses the context of the row you clicked. It also
// keeps the escape/scroll-lock behaviour in one place rather than in each form.
import { useEffect } from "react";
import { X } from "lucide-react";

export default function SidePanel({
  open, title, subtitle, onClose, children, footer, width = 460,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Actions pinned to the bottom, so a long form never hides its Save. */
  footer?: React.ReactNode;
  width?: number;
}) {
  // Escape closes, and the page behind does not scroll while it is open — a
  // panel you can scroll past is a panel you lose.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sidep" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sidep__scrim" onClick={onClose} />
      <aside className="sidep__panel" style={{ width }}>
        <header className="sidep__head">
          <div style={{ minWidth: 0 }}>
            <h2 className="sidep__title">{title}</h2>
            {subtitle && <p className="sidep__sub">{subtitle}</p>}
          </div>
          <button className="sidep__close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="sidep__body">{children}</div>

        {footer && <footer className="sidep__foot">{footer}</footer>}
      </aside>
    </div>
  );
}
