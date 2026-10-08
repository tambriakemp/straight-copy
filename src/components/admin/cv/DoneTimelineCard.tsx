import { Check } from "lucide-react";
import CvCheckbox from "./CvCheckbox";
import ProjectTag from "./ProjectTag";
import { IssueRefChips, LinkifiedText } from "./IssueLinks";
import type { DoneItem, DoneRange } from "@/lib/briefs";
import type { useBriefItemCompletions } from "@/lib/briefItemCompletions";

function formatChicago(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", ...opts });
}

function rangeLabel(range: DoneRange | null | undefined, count: number): string {
  const parts: string[] = [];
  if (range?.since) parts.push(formatChicago(range.since, { weekday: "short", hour: "numeric", minute: "2-digit" }));
  if (range?.until) parts.push(formatChicago(range.until, { hour: "numeric", minute: "2-digit" }));
  const when = parts.join(" → ");
  const itemCount = `${count} item${count === 1 ? "" : "s"}`;
  return when ? `${when} · ${itemCount}` : itemCount;
}

export default function DoneTimelineCard({
  items, range, isDone, complete, undo, briefDate,
}: {
  items: DoneItem[];
  range?: DoneRange | null;
  isDone: (id: string) => boolean;
  complete: ReturnType<typeof useBriefItemCompletions>["complete"];
  undo: ReturnType<typeof useBriefItemCompletions>["undo"];
  briefDate: string;
}) {
  if (!items.length) return null;
  const projects = Array.from(new Set(items.map((i) => i.project)));

  return (
    <div className="cv-donetl">
      <div className="cv-donetl__head">
        <div>
          <div className="cv-donetl__eyebrow">Done</div>
          <div className="cv-donetl__title"><h3>Since last digest</h3><span className="cv-donetl__range">{rangeLabel(range, items.length)}</span></div>
        </div>
        <div className="cv-donetl__legend">
          {projects.map((p) => <ProjectTag key={p} project={p} />)}
        </div>
      </div>

      <div className="cv-donetl__list">
        {items.map((item) => {
          const done = isDone(item.id);
          return (
            <div key={item.id} className="cv-donetl__item">
              <span className="cv-donetl__node"><Check size={13} strokeWidth={3} /></span>
              <div style={{ opacity: done ? 0.55 : 1, minWidth: 0 }}>
                <div className="cv-donetl__h">
                  <b style={{ textDecoration: done ? "line-through" : "none" }}>{item.title}</b>
                  <ProjectTag project={item.project} />
                </div>
                {item.note && <div className="cv-donetl__note"><LinkifiedText text={item.note} /></div>}
              </div>
              <div className="cv-donetl__r">
                {item.task_ids && item.task_ids.length > 0 && (
                  <span className="cv-donetl__refs"><IssueRefChips ids={item.task_ids} /></span>
                )}
                <CvCheckbox
                  done={done}
                  onComplete={() => complete({
                    item_id: item.id, item_text: item.title,
                    issue_identifier: item.task_ids?.[0] ?? null, brief_date: briefDate,
                  })}
                  onUndo={() => undo(item.id)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
