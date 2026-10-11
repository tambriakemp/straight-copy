import { AlertTriangle, Clock, Lock } from "lucide-react";
import NeedsYouRow, { type RowMarker } from "./NeedsYouRow";
import type { InFlightItem, InFlightStatus } from "@/lib/briefs";
import type { useBriefItemCompletions } from "@/lib/briefItemCompletions";

// CRE-388: "In flight / stuck" — same row design as the merged Needs-you-now
// list, with a status icon (not a plain priority dot) telling Bree at a
// glance whether something is actively moving, waiting on someone else, or
// genuinely stuck.
const STATUS_MARKER: Record<InFlightStatus, RowMarker> = {
  stuck: { kind: "icon", icon: AlertTriangle, color: "#dc2626", label: "Stuck" },
  blocked: { kind: "icon", icon: Lock, color: "#d97706", label: "Blocked" },
  in_progress: { kind: "icon", icon: Clock, color: "#4f46e5", label: "In progress" },
};

export default function InFlightCard({
  items, isDone, complete, undo, briefDate,
}: {
  items: InFlightItem[];
  isDone: (id: string) => boolean;
  complete: ReturnType<typeof useBriefItemCompletions>["complete"];
  undo: ReturnType<typeof useBriefItemCompletions>["undo"];
  briefDate: string;
}) {
  if (!items.length) return null;
  return (
    <div className="cv-nylist">
      {items.map((item) => (
        <NeedsYouRow
          key={item.id}
          marker={STATUS_MARKER[item.status]}
          title={item.title}
          description={item.body}
          category={item.category}
          taskIds={item.task_ids ?? []}
          done={isDone(item.id)}
          onComplete={() => complete({
            item_id: item.id, item_text: item.title,
            issue_identifier: item.task_ids?.[0] ?? null, brief_date: briefDate,
          })}
          onUndo={() => undo(item.id)}
        />
      ))}
    </div>
  );
}
