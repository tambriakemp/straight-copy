import { useState } from "react";
import ProjectTag from "./ProjectTag";
import { IssueRefChips, LinkifiedText } from "./IssueLinks";
import type { NeedsYouRowData } from "@/lib/needsYouRows";
import { formatMoment } from "@/lib/briefFormat";

// One card in Today's "Decide" list — the rows where an agent has stopped
// and is holding a named set of answers open.
//
// Not a NeedsYouRow with extra bits. A Do row ends in a checkbox, which
// says "I handled this"; a Decide card ends in the agent's own options,
// which say "pick one and I carry on". Giving the second a checkbox too
// would offer two different ways to close the same thing, and only one of
// them tells the agent what you chose.
//
// CRE-393: the buttons are wired now (see src/lib/decideActions.ts and the
// decide-action edge function). Picking an option, snoozing, or asking a
// question all go through the parent's handlers below; this component
// stays about layout and the merge-confirm interstitial, not the network
// call itself.
export interface MergeSummary {
  repo: string; prNumber: number; title: string; url: string;
  branch: string; baseBranch: string;
  filesChanged: number; additions: number; deletions: number;
  ciStatus: string; checks: Array<{ name: string; conclusion: string | null }>;
}

export default function DecideCard({
  row, onPick, onSnooze, onAsk,
}: {
  row: NeedsYouRowData;
  /** Absent until an answer has somewhere to go; the buttons disable. */
  onPick?: (option: string, confirmed?: boolean) => Promise<{ ok: boolean; needsConfirm?: boolean; summary?: MergeSummary }>;
  onSnooze?: (until: "tomorrow" | "monday") => void;
  onAsk?: (question: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ option: string; summary: MergeSummary } | null>(null);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");

  const options = row.options ?? [];
  // The brief writes a machine timestamp here; the pill shows words.
  const deadline = formatMoment(row.deadline);
  const titleNode = row.href ? (
    <a href={row.href} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
      {row.title}
    </a>
  ) : row.title;

  const pick = async (option: string, confirmed?: boolean) => {
    if (!onPick) return;
    setBusy(option);
    try {
      const result = await onPick(option, confirmed);
      if (result.needsConfirm && result.summary) {
        setConfirm({ option, summary: result.summary });
      } else {
        setConfirm(null);
      }
    } finally {
      setBusy(null);
    }
  };

  const sendQuestion = () => {
    if (!question.trim()) return;
    onAsk?.(question.trim());
    setQuestion("");
    setAsking(false);
  };

  return (
    <article className="cv-decide">
      <div className="cv-decide__meta">
        <ProjectTag project={row.category} />
        {deadline && <span className="cv-chip cv-chip--red">Due {deadline}</span>}
        {row.waitingSince && (
          <span className="cv-decide__since">Waiting since {row.waitingSince}</span>
        )}
      </div>

      <h4 className="cv-decide__title">{titleNode}</h4>

      {row.description && (
        <p className="cv-decide__body"><LinkifiedText text={row.description} /></p>
      )}

      {confirm ? (
        <div style={{ background: "var(--cv-card)", border: "1px solid var(--cv-border-strong)", borderRadius: "var(--cv-r-sm)", padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          <p className="cv-decide__body" style={{ margin: 0, fontWeight: 600 }}>
            Merge PR #{confirm.summary.prNumber} into <b>{confirm.summary.baseBranch}</b>?
          </p>
          <p className="cv-decide__since" style={{ margin: 0 }}>
            {confirm.summary.repo} · {confirm.summary.filesChanged} file{confirm.summary.filesChanged === 1 ? "" : "s"}
            {" "}(+{confirm.summary.additions}/-{confirm.summary.deletions}) · CI {confirm.summary.ciStatus}
          </p>
          <div className="cv-decide__foot">
            <button
              type="button"
              className="cv-decide__opt cv-decide__opt--primary"
              disabled={busy === confirm.option}
              onClick={() => pick(confirm.option, true)}
            >
              Confirm merge
            </button>
            <button type="button" className="cv-decide__opt" onClick={() => setConfirm(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        (options.length > 0 || row.taskIds.length > 0) && (
          <div className="cv-decide__foot">
            {options.map((opt, i) => (
              <button
                key={opt}
                type="button"
                className={`cv-decide__opt ${i === 0 ? "cv-decide__opt--primary" : ""}`}
                disabled={!onPick || busy !== null}
                title={onPick ? undefined : "Answering from here isn't wired up yet"}
                onClick={() => pick(opt)}
              >
                {busy === opt ? "Working…" : opt}
              </button>
            ))}
            {row.taskIds.length > 0 && <IssueRefChips ids={row.taskIds} />}
          </div>
        )
      )}

      {!confirm && (
        <div className="cv-decide__foot" style={{ marginTop: 2, borderTop: "1px solid var(--cv-border)", paddingTop: 8 }}>
          <button
            type="button"
            className="cv-decide__opt"
            style={{ background: "transparent", fontSize: 13, padding: "6px 10px", minHeight: 32 }}
            disabled={!onSnooze}
            onClick={() => onSnooze?.("tomorrow")}
          >
            Not now
          </button>
          <button
            type="button"
            className="cv-decide__opt"
            style={{ background: "transparent", fontSize: 13, padding: "6px 10px", minHeight: 32 }}
            disabled={!onSnooze}
            onClick={() => onSnooze?.("monday")}
          >
            Until Monday
          </button>
          <button
            type="button"
            className="cv-decide__opt"
            style={{ background: "transparent", fontSize: 13, padding: "6px 10px", minHeight: 32 }}
            disabled={!onAsk}
            onClick={() => setAsking((a) => !a)}
          >
            Ask a question
          </button>
        </div>
      )}

      {asking && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <textarea
            placeholder="What do you want to ask?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            style={{
              font: "inherit", fontSize: 14, width: "100%", borderRadius: "var(--cv-r-sm)",
              border: "1px solid var(--cv-border-strong)", background: "var(--cv-card)",
              color: "var(--cv-ink)", padding: "8px 10px", resize: "vertical",
            }}
          />
          <div className="cv-decide__foot">
            <button type="button" className="cv-decide__opt cv-decide__opt--primary" disabled={!question.trim()} onClick={sendQuestion}>
              Send
            </button>
            <button type="button" className="cv-decide__opt" onClick={() => { setAsking(false); setQuestion(""); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
