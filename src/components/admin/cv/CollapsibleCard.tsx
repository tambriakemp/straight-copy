// A card whose body folds away, with the heading as the control.
//
// Built for the sections that are history rather than work — declined
// proposals, superseded versions. A declined proposal is a decision
// already made: it has to stay reachable, because "did we ever send
// them one" is a real question, but open by default it takes the same
// room as the proposals someone still owes an answer on and reads as
// something to act on.
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export default function CollapsibleCard({
  title, count, tone = "gray", defaultOpen = false, children,
}: {
  title: string;
  /** The chip beside the title. Shown closed, so the heading alone
   *  answers "how many", which is usually the whole question. */
  count?: number;
  tone?: "gray" | "green" | "amber" | "red" | "blue";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="cv-card cv-card-pad">
      <button
        type="button"
        className="cv-collapse__head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="cv-card-title">{title}</span>
        {count != null && <span className={`cv-chip cv-chip--${tone}`}>{count}</span>}
        <span style={{ flex: 1 }} />
        <ChevronDown size={18} className={`cv-key__chev ${open ? "cv-key__chev--on" : ""}`} aria-hidden="true" />
      </button>
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </section>
  );
}
