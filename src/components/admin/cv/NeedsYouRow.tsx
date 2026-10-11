import type { LucideIcon } from "lucide-react";
import CvCheckbox from "./CvCheckbox";
import ProjectTag from "./ProjectTag";
import { IssueRefChips, LinkifiedText } from "./IssueLinks";
import type { useBriefItemCompletions } from "@/lib/briefItemCompletions";

// CRE-388: shared row shape for the merged "Needs you now" list and the
// new "In flight / stuck" card — the Done-timeline look (status marker,
// bold title, category pill, one-line description, CRE chips, checkbox
// on the far right) applied to both instead of two near-duplicate rows.
// `marker` is a colored dot for Needs-you-now (priority: orange/yellow)
// or a colored status icon for In-flight (stuck/blocked/in progress).
export type RowMarker =
  | { kind: "dot"; color: string; label: string }
  | { kind: "icon"; icon: LucideIcon; color: string; label: string };

export default function NeedsYouRow({
  marker, title, description, nextStep, category, taskIds, href, done, onComplete, onUndo,
}: {
  marker: RowMarker;
  title: string;
  description?: string | null;
  nextStep?: string | null;
  category: string;
  taskIds: string[];
  href?: string | null;
  done: boolean;
  onComplete: () => Promise<boolean> | boolean;
  onUndo: () => Promise<boolean> | boolean;
}) {
  const titleNode = href ? (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>{title}</a>
  ) : (
    title
  );
  return (
    <div className="cv-nyrow">
      <span
        className="cv-nyrow__node"
        title={marker.label}
        style={marker.kind === "dot" ? { background: marker.color } : { background: marker.color, color: "#fff" }}
      >
        {marker.kind === "icon" && <marker.icon size={12} strokeWidth={2.5} />}
      </span>
      <div className="cv-nyrow__body" style={{ opacity: done ? 0.55 : 1 }}>
        <div className="cv-nyrow__h">
          <b style={{ textDecoration: done ? "line-through" : "none" }}>{titleNode}</b>
          <ProjectTag project={category} />
        </div>
        {description && <div className="cv-nyrow__desc"><LinkifiedText text={description} /></div>}
        {nextStep && <div className="cv-nyrow__next"><b>Next:</b> <LinkifiedText text={nextStep} /></div>}
      </div>
      <div className="cv-nyrow__r">
        {taskIds.length > 0 && <span className="cv-nyrow__refs"><IssueRefChips ids={taskIds} /></span>}
        <CvCheckbox done={done} onComplete={onComplete} onUndo={onUndo} />
      </div>
    </div>
  );
}
