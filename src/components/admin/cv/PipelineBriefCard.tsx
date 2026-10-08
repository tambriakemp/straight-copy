// CRE-366 §3: stage pills are read live from pipeline-board (CRE-332,
// SureContact stage ids) — never from the brief's own JSON — so they can
// never drift from what /admin/pipeline shows. `pipeline` (the banner +
// hot leads) is the only part that comes from the brief payload.
//
// The mockup's four pills are Lead, Intake, Proposal, Won; pipeline-board's
// own columns are lead, intake, proposalSent, signed, won (+ lost, hidden
// here same as on /admin/pipeline). "Proposal" below folds proposalSent and
// signed together — both are still pre-money, pre-Won stages — rather than
// adding a fifth pill the mockup didn't ask for. Flagged in the CRE-366 PR
// for Bree/Ara to confirm.
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import CvCheckbox from "./CvCheckbox";
import { IssueRefChips, LinkifiedText } from "./IssueLinks";
import { formatMoney } from "@/lib/adminOperations";
import { loadPipelineBoard, type PipelineBoard } from "@/lib/pipelineBoard";
import type { BriefPipeline } from "@/lib/briefs";
import type { useBriefItemCompletions } from "@/lib/briefItemCompletions";

const AVATAR_PALETTE = [
  { bg: "#f3effe", fg: "#6d28d9" },
  { bg: "#e6f6f3", fg: "#0f766e" },
  { bg: "#fdf0f6", fg: "#be185d" },
  { bg: "#eef0ff", fg: "#4338ca" },
  { bg: "#fff6e8", fg: "#b45309" },
];

function initialsOf(name: string): string {
  const head = name.split("·")[0].trim();
  const words = head.split(/\s+/).map((w) => w.replace(/[.,]/g, "")).filter((w) => /^[A-Za-z]+$/.test(w));
  return words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}
function avatarColor(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}
function formatChicago(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function cutoffLabel(cutoffIso: string): string {
  const diffMs = new Date(cutoffIso).getTime() - Date.now();
  if (diffMs <= 0) return "Cutoff passed";
  const days = Math.ceil(diffMs / 86_400_000);
  return days <= 1 ? "Cutoff today" : `Cutoff in ${days} days`;
}

export default function PipelineBriefCard({
  pipeline, isDone, complete, undo, briefDate,
}: {
  pipeline?: BriefPipeline | null;
  isDone: (id: string) => boolean;
  complete: ReturnType<typeof useBriefItemCompletions>["complete"];
  undo: ReturnType<typeof useBriefItemCompletions>["undo"];
  briefDate: string;
}) {
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPipelineBoard().then(setBoard).catch((e: Error) => setError(e.message || "Could not load the pipeline"));
  }, []);

  const outreachRound = pipeline?.outreach_round ?? null;
  const hotLeads = pipeline?.hot_leads ?? [];

  const lead = board?.columns.find((c) => c.key === "lead");
  const intake = board?.columns.find((c) => c.key === "intake");
  const proposalCols = board?.columns.filter((c) => c.key === "proposalSent" || c.key === "signed") ?? [];
  const won = board?.columns.find((c) => c.key === "won");
  const proposal = { count: proposalCols.reduce((s, c) => s + c.count, 0), totalCents: proposalCols.reduce((s, c) => s + c.totalCents, 0) };

  const maxCount = Math.max(1, lead?.count ?? 0, intake?.count ?? 0, proposal.count);
  const barWidth = (n: number) => (n > 0 ? Math.max(8, Math.round((n / maxCount) * 100)) : 0);

  const hasStages = Boolean(board) && !error;
  if (!hasStages && !outreachRound && !hotLeads.length) return null;

  return (
    <div className="cv-pbrief">
      <div className="cv-pbrief__head">
        <div>
          <div className="cv-pbrief__eyebrow">Pipeline</div>
          <div className="cv-pbrief__title"><h3>Deals &amp; prospects</h3><span className="cv-pbrief__range">SureContact stages</span></div>
        </div>
        <div className="cv-pbrief__legend">
          <span><i className="cv-pbrief__dot" style={{ background: "#4f46e5" }} />Open stages</span>
          <span><i className="cv-pbrief__dot" style={{ background: "#0d9488" }} />Won</span>
          {outreachRound && <span><i className="cv-pbrief__dot" style={{ background: "#db2777" }} />Outreach round</span>}
        </div>
      </div>

      {error && <div className="cv-pbrief__error">Couldn't load live pipeline stages: {error}</div>}

      {hasStages && (
        <div className="cv-pbrief__stages">
          <div className="cv-pbrief__stage">
            <div className="cv-pbrief__nm"><i className="cv-pbrief__dot" style={{ background: "#a5b4fc" }} />Lead</div>
            <div className="cv-pbrief__cnt"><b>{lead?.count ?? 0}</b><span>{formatMoney(lead?.totalCents ?? 0)}</span></div>
            <div className="cv-pbrief__bar"><i style={{ width: `${barWidth(lead?.count ?? 0)}%`, background: "#a5b4fc" }} /></div>
          </div>
          <div className="cv-pbrief__stage">
            <span className="cv-pbrief__chev"><ChevronRight size={11} /></span>
            <div className="cv-pbrief__nm"><i className="cv-pbrief__dot" style={{ background: "#818cf8" }} />Intake</div>
            <div className="cv-pbrief__cnt"><b>{intake?.count ?? 0}</b><span>{formatMoney(intake?.totalCents ?? 0)}</span></div>
            <div className="cv-pbrief__bar"><i style={{ width: `${barWidth(intake?.count ?? 0)}%`, background: "#818cf8" }} /></div>
          </div>
          <div className="cv-pbrief__stage">
            <span className="cv-pbrief__chev"><ChevronRight size={11} /></span>
            <div className="cv-pbrief__nm"><i className="cv-pbrief__dot" style={{ background: "#4f46e5" }} />Proposal</div>
            <div className="cv-pbrief__cnt"><b>{proposal.count}</b><span>{formatMoney(proposal.totalCents)}</span></div>
            <div className="cv-pbrief__bar"><i style={{ width: `${barWidth(proposal.count)}%`, background: "#4f46e5" }} /></div>
          </div>
          <div className="cv-pbrief__stage cv-pbrief__stage--won">
            <span className="cv-pbrief__chev"><ChevronRight size={11} /></span>
            <div className="cv-pbrief__nm"><i className="cv-pbrief__dot" style={{ background: "#0d9488" }} />Won</div>
            <div className="cv-pbrief__cnt"><b>{formatMoney(won?.totalCents ?? 0)}</b></div>
            <div className="cv-pbrief__bar"><i style={{ width: "100%", background: "#0d9488" }} /></div>
          </div>
        </div>
      )}

      {outreachRound && (
        <div className="cv-pbrief__round">
          <span className="cv-pbrief__big">{outreachRound.pending}</span>
          <div className="cv-pbrief__roundtxt">
            <b>{outreachRound.date ? `${formatChicago(outreachRound.date)} outreach round · ` : ""}prospect previews pending your approval</b>
            {outreachRound.note && <><br /><LinkifiedText text={outreachRound.note} /></>}
          </div>
          <div className="cv-pbrief__roundright">
            {outreachRound.cutoff && <span className="cv-pbrief__duepill">{cutoffLabel(outreachRound.cutoff)}</span>}
            <CvCheckbox
              done={isDone(`pipeline-outreach:${outreachRound.date ?? "round"}`)}
              onComplete={() => complete({
                item_id: `pipeline-outreach:${outreachRound.date ?? "round"}`,
                item_text: "Outreach round · prospect previews pending your approval",
                brief_date: briefDate,
              })}
              onUndo={() => undo(`pipeline-outreach:${outreachRound.date ?? "round"}`)}
            />
          </div>
        </div>
      )}

      {hotLeads.length > 0 && (
        <>
          <div className="cv-pbrief__subhead">Hot right now</div>
          <div className="cv-pbrief__leads">
            {hotLeads.map((leadItem) => {
              const done = isDone(leadItem.id);
              const colors = avatarColor(leadItem.name);
              return (
                <div key={leadItem.id} className="cv-pbrief__lead">
                  <div className="cv-pbrief__av" style={{ background: colors.bg, color: colors.fg }}>{initialsOf(leadItem.name)}</div>
                  <div className="cv-pbrief__leadbody" style={{ opacity: done ? 0.55 : 1 }}>
                    <div className="cv-pbrief__leadtop">
                      <span className="cv-pbrief__who" style={{ textDecoration: done ? "line-through" : "none" }}>{leadItem.name}</span>
                      <CvCheckbox
                        done={done}
                        onComplete={() => complete({
                          item_id: leadItem.id, item_text: leadItem.name,
                          issue_identifier: leadItem.task_id ?? null, brief_date: briefDate,
                        })}
                        onUndo={() => undo(leadItem.id)}
                      />
                    </div>
                    <div className="cv-pbrief__what"><LinkifiedText text={leadItem.status} /></div>
                    <div className="cv-pbrief__leadmeta">
                      {leadItem.stage && <span className="cv-pbrief__stagechip">{leadItem.stage}</span>}
                      {leadItem.at && <span className="cv-pbrief__heat">● {formatChicago(leadItem.at)}</span>}
                      {leadItem.task_id && <IssueRefChips ids={[leadItem.task_id]} />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
