import { CircleCheck } from "lucide-react";
import CvCheckbox from "./CvCheckbox";
import ProjectTag from "./ProjectTag";
import { IssueRefChips, LinkifiedText } from "./IssueLinks";
import type { ApprovalCard as ApprovalCardData } from "@/lib/briefs";
import type { useBriefItemCompletions } from "@/lib/briefItemCompletions";

// CRE-366 §2b: waiting badge is computed client-side from waiting_since /
// deadline — red whenever a deadline is set (regardless of how far off),
// amber once it's been waiting 2+ days with no deadline, neutral otherwise.
function waitingBadge(waitingSince?: string, deadline?: string | null): { tone: "due" | "amber" | "neutral"; label: string } {
  const now = Date.now();
  if (deadline) {
    const diffMs = new Date(deadline).getTime() - now;
    if (diffMs <= 0) return { tone: "due", label: "Overdue" };
    const days = Math.ceil(diffMs / 86_400_000);
    return { tone: "due", label: days <= 1 ? "Cutoff today" : `Cutoff in ${days} days` };
  }
  if (waitingSince) {
    const days = Math.max(0, Math.floor((now - new Date(waitingSince).getTime()) / 86_400_000));
    if (days >= 2) return { tone: "amber", label: `Waiting ${days} days` };
    return { tone: "neutral", label: days === 0 ? "New today" : `Waiting ${days} day${days === 1 ? "" : "s"}` };
  }
  return { tone: "neutral", label: "New" };
}

function ApprovalCardTile({
  approval, done, onComplete, onUndo,
}: {
  approval: ApprovalCardData;
  done: boolean;
  onComplete: () => Promise<boolean> | boolean;
  onUndo: () => Promise<boolean> | boolean;
}) {
  const badge = waitingBadge(approval.waiting_since, approval.deadline);
  return (
    <div className={`cv-approval${badge.tone === "due" ? " cv-approval--hot" : ""}`}>
      <CvCheckbox done={done} onComplete={onComplete} onUndo={onUndo} />
      <div className="cv-approval__body" style={{ opacity: done ? 0.55 : 1 }}>
        <div className="cv-approval__top">
          <ProjectTag project={approval.project} />
          {approval.task_ids && approval.task_ids.length > 0 && <IssueRefChips ids={approval.task_ids} />}
          <span className={`cv-approval__wait cv-approval__wait--${badge.tone}`}>{badge.label}</span>
        </div>
        <div className="cv-approval__q" style={{ textDecoration: done ? "line-through" : "none" }}>{approval.title}</div>
        {approval.context && <div className="cv-approval__ctx"><LinkifiedText text={approval.context} /></div>}
        <div className="cv-approval__bot">
          {(approval.options ?? []).map((opt) => <span key={opt} className="cv-approval__opt">{opt}</span>)}
          {approval.link && (
            <a className="cv-approval__open" href={approval.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              Open ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ApprovalsCard({
  approvals, isDone, complete, undo, briefDate,
}: {
  approvals: ApprovalCardData[];
  isDone: (id: string) => boolean;
  complete: ReturnType<typeof useBriefItemCompletions>["complete"];
  undo: ReturnType<typeof useBriefItemCompletions>["undo"];
  briefDate: string;
}) {
  if (!approvals.length) return null;
  return (
    <div className="cv-approvals">
      <div className="cv-approvals__head">
        <div>
          <div className="cv-approvals__eyebrow">
            <span className="cv-section__icon"><CircleCheck size={13} /></span>
            Decisions
            <span className="cv-section__count">{approvals.length}</span>
          </div>
          <div className="cv-approvals__title">
            <h3>Awaiting your approval</h3>
            <span className="cv-approvals__range">{approvals.length} decision{approvals.length === 1 ? "" : "s"} · only real choices, no FYIs</span>
          </div>
        </div>
        <div className="cv-approvals__legend">
          <span><i className="cv-approvals__dot" style={{ background: "#db2777" }} />Has a deadline</span>
          <span><i className="cv-approvals__dot" style={{ background: "#d97706" }} />Waiting 2+ days</span>
          <span><i className="cv-approvals__dot" style={{ background: "#9ca3af" }} />Newer</span>
        </div>
      </div>

      <div className="cv-approvals__grid">
        {approvals.map((a) => (
          <ApprovalCardTile
            key={a.id}
            approval={a}
            done={isDone(a.id)}
            onComplete={() => complete({ item_id: a.id, item_text: a.title, issue_identifier: a.task_ids?.[0] ?? null, brief_date: briefDate })}
            onUndo={() => undo(a.id)}
          />
        ))}
      </div>
      <div className="cv-approvals__footnote">
        Tasks like a Lovable paste or a Slack invite stay in <b>Needs you</b>, not here.
      </div>
    </div>
  );
}
