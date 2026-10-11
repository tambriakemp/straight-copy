import ProjectTag from "./ProjectTag";
import { IssueRefChips, LinkifiedText } from "./IssueLinks";
import type { NeedsYouRowData } from "@/lib/needsYouRows";

// One card in Today's "Decide" list — the rows where an agent has stopped
// and is holding a named set of answers open.
//
// Not a NeedsYouRow with extra bits. A Do row ends in a checkbox, which
// says "I handled this"; a Decide card ends in the agent's own options,
// which say "pick one and I carry on". Giving the second a checkbox too
// would offer two different ways to close the same thing, and only one of
// them tells the agent what you chose.
//
// The buttons are drawn from the brief's `options` and are not wired to
// anything yet: nothing in the schema records which option was picked.
// They are deliberately real <button>s rather than chips so the shape is
// right when that lands — see the Decide section comment in Today.tsx.
export default function DecideCard({
  row, onPick,
}: {
  row: NeedsYouRowData;
  /** Absent until an answer has somewhere to go; the buttons disable. */
  onPick?: (option: string) => void;
}) {
  const options = row.options ?? [];
  const titleNode = row.href ? (
    <a href={row.href} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
      {row.title}
    </a>
  ) : row.title;

  return (
    <article className="cv-decide">
      <div className="cv-decide__meta">
        <ProjectTag project={row.category} />
        {row.deadline && <span className="cv-chip cv-chip--red">Due {row.deadline}</span>}
        {row.waitingSince && (
          <span className="cv-decide__since">Waiting since {row.waitingSince}</span>
        )}
      </div>

      <h4 className="cv-decide__title">{titleNode}</h4>

      {row.description && (
        <p className="cv-decide__body"><LinkifiedText text={row.description} /></p>
      )}

      {(options.length > 0 || row.taskIds.length > 0) && (
        <div className="cv-decide__foot">
          {options.map((opt, i) => (
            <button
              key={opt}
              type="button"
              className={`cv-decide__opt ${i === 0 ? "cv-decide__opt--primary" : ""}`}
              disabled={!onPick}
              title={onPick ? undefined : "Answering from here isn't wired up yet"}
              onClick={() => onPick?.(opt)}
            >
              {opt}
            </button>
          ))}
          {row.taskIds.length > 0 && <IssueRefChips ids={row.taskIds} />}
        </div>
      )}
    </article>
  );
}
