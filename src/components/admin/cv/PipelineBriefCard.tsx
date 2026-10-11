// Pipeline, laid out to the canvas: the outreach round as one tile, then a
// row per hot lead — a coloured dot, the name with its stage, and what
// actually happened.
//
// The four-stage funnel (Lead → Intake → Proposal → Won, with counts, money
// and bars, read live from pipeline-board) is gone from here. /admin/pipeline
// is a board of those five columns with the same counts on it, so the funnel
// was a second, narrower copy of a whole page squeezed into a sidebar — and
// it was the only reason this card did an async fetch, which is why it had
// to own its own <Card> to avoid a flash of empty box (CRE-388). It doesn't
// any more.
//
// That does not put stage text back in the brief's hands: a lead's own
// `stage` chip was always brief data (CRE-366 §3 was about the funnel's
// pills), and `stageTone` colours it by meaning rather than trusting it to
// be one of pipeline-board's keys.
import Card from "./Card";
import CvCheckbox from "./CvCheckbox";
import { IssueRefChips, LinkifiedText } from "./IssueLinks";
import { stageTone, TONE_DOT } from "@/lib/pipelineTone";
import { formatMoment } from "@/lib/briefFormat";
import type { BriefPipeline, HotLead } from "@/lib/briefs";
import type { useBriefItemCompletions } from "@/lib/briefItemCompletions";

function formatChicago(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function cutoffLabel(cutoffIso: string): string {
  const diffMs = new Date(cutoffIso).getTime() - Date.now();
  if (Number.isNaN(diffMs)) return formatMoment(cutoffIso) ?? cutoffIso;
  if (diffMs <= 0) return "Cutoff passed";
  const days = Math.ceil(diffMs / 86_400_000);
  return days <= 1 ? "Cutoff today" : `Cutoff in ${days} days`;
}

function LeadRow({
  lead, isDone, complete, undo, briefDate,
}: {
  lead: HotLead;
  isDone: (id: string) => boolean;
  complete: ReturnType<typeof useBriefItemCompletions>["complete"];
  undo: ReturnType<typeof useBriefItemCompletions>["undo"];
  briefDate: string;
}) {
  const done = isDone(lead.id);
  const tone = stageTone(lead.stage);
  return (
    <div className="cv-fly">
      <i className="cv-fly__dot" style={{ background: TONE_DOT[tone] }} />
      <div className="cv-fly__body" style={{ opacity: done ? 0.55 : 1 }}>
        <div className="cv-fly__title">
          <span style={{ textDecoration: done ? "line-through" : "none" }}>{lead.name}</span>
          {lead.stage && <span className={`cv-chip cv-chip--${tone}`}>{lead.stage}</span>}
          {/* Kept from the funnel version: ticking a lead records that you
              dealt with it. The canvas draws these rows without a control,
              but nothing else on the page records that. */}
          <span style={{ marginLeft: "auto" }}>
            <CvCheckbox
              done={done}
              onComplete={() => complete({
                item_id: lead.id, item_text: lead.name,
                issue_identifier: lead.task_id ?? null, brief_date: briefDate,
              })}
              onUndo={() => undo(lead.id)}
            />
          </span>
        </div>
        <div className="cv-fly__what"><LinkifiedText text={lead.status} /></div>
        {(lead.at || lead.task_id) && (
          <div className="cv-fly__meta">
            {lead.at && <span>{formatChicago(lead.at)}</span>}
            {lead.task_id && <IssueRefChips ids={[lead.task_id]} />}
          </div>
        )}
      </div>
    </div>
  );
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
  const round = pipeline?.outreach_round ?? null;
  const hotLeads = pipeline?.hot_leads ?? [];
  if (!round && !hotLeads.length) return null;

  const roundId = `pipeline-outreach:${round?.date ?? "round"}`;

  return (
    <Card className="cv-card-pad">
      <div className="cv-card-head">
        <h2 className="cv-card-title">Pipeline</h2>
      </div>

      {round && (
        <div className="cv-tile cv-tile--violet" style={{ marginBottom: hotLeads.length ? 12 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="cv-tile__label">
              Outreach round{round.date ? ` · ${formatChicago(round.date)}` : ""}
            </span>
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
              {round.cutoff && <span className="cv-chip cv-chip--red">{cutoffLabel(round.cutoff)}</span>}
              <CvCheckbox
                done={isDone(roundId)}
                onComplete={() => complete({
                  item_id: roundId,
                  item_text: "Outreach round · prospect previews pending your approval",
                  brief_date: briefDate,
                })}
                onUndo={() => undo(roundId)}
              />
            </span>
          </div>
          <b className="cv-tile__value">{round.pending} pending</b>
          {round.note && <small className="cv-tile__sub"><LinkifiedText text={round.note} /></small>}
        </div>
      )}

      {hotLeads.map((lead) => (
        <LeadRow
          key={lead.id} lead={lead}
          isDone={isDone} complete={complete} undo={undo} briefDate={briefDate}
        />
      ))}
    </Card>
  );
}
