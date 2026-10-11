import CvCheckbox from "./CvCheckbox";
import ProjectTag from "./ProjectTag";
import { IssueRefChips, LinkifiedText } from "./IssueLinks";
import type { useBriefItemCompletions } from "@/lib/briefItemCompletions";
import type { RowMarker } from "@/lib/needsYouRows";

// CRE-388/CRE-391: shared row shape for the single merged "Needs you now"
// list — every row (live Paperclip items, approvals, in-flight/stuck,
// narrative brief lines) renders through this one component now. `marker`
// is a colored dot (priority, or an approval's waiting badge) or a colored
// status icon (in-flight: stuck/blocked/in progress) — see needsYouRows.ts,
// which computes it per source.
export type { RowMarker };

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
