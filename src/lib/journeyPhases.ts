// The phase ladder on the portal's "Where things stand" card.
//
// Not projectPhases.ts, which is a different thing with a confusingly
// similar name: that one guesses a phase from the task percentage for
// the ADMIN project page, because no schema recorded one. This reads the
// real journey_nodes rows, which do.
//
// Pure, because what it decides is what a client believes about their
// own project. A ladder that shows "Now: Design" when design finished
// three weeks ago is not a layout bug — it is the client not chasing a
// thing they should be chasing, and reading the page as decoration
// afterwards.
//
// journey_nodes has a status per node, and those statuses were written
// by several things over two years. Rather than trust one spelling, a
// node is DONE if it says so in any of the ways it has ever said so, and
// the first node that is not done is NOW.

export interface PhaseNode {
  id: string;
  key: string;
  label: string;
  order_index: number;
  status: string | null;
  completed_at?: string | null;
  started_at?: string | null;
}

export type PhaseState = "done" | "now" | "next" | "later";

export interface Phase {
  id: string;
  label: string;
  state: PhaseState;
}

const DONE = new Set(["complete", "completed", "done", "client_submitted", "approved", "skipped"]);

/** Has this node been finished, however that was recorded? */
export function isDone(n: PhaseNode): boolean {
  if (n.completed_at) return true;
  return DONE.has((n.status ?? "").trim().toLowerCase());
}

/**
 * The ladder, in order: everything finished, then the one in flight,
 * then what follows.
 *
 * "Now" is the first node that is not done, not the one whose status
 * says in_progress — a node nobody remembered to start is still the next
 * thing that has to happen, and leaving the ladder with no Now at all
 * reads as a project that has stopped.
 *
 * Trailing done nodes after an unfinished one stay done: work does get
 * done out of order, and demoting it to "later" because something
 * earlier is open would tell the client it has to happen again.
 */
export function phaseLadder(nodes: PhaseNode[]): Phase[] {
  const sorted = [...nodes].sort((a, b) => a.order_index - b.order_index);
  const firstOpen = sorted.findIndex((n) => !isDone(n));
  return sorted.map((n, i) => ({
    id: n.id,
    label: n.label,
    state: isDone(n) ? "done"
      : i === firstOpen ? "now"
        : i === firstOpen + 1 ? "next"
          : "later",
  }));
}

export const PHASE_WORD: Record<PhaseState, string> = {
  done: "Done", now: "Now", next: "Next", later: "Later",
};

/**
 * The line under the ladder: what is happening, in a sentence.
 *
 * Null when there is nothing in flight, because "Now: nothing" is worse
 * than no sentence — a finished project should read as finished.
 *
 * Typed to the two fields it reads, not to `Phase[]`: `PortalMilestone[]` --
 * the shape `clientPortal.projectPhases()` answers with now that the ladder
 * is computed server-side -- has the same `label` and the same `state`
 * union and no `id`, and this has never needed one.
 */
export function phaseSummary(phases: Array<{ label: string; state: PhaseState }>): string | null {
  const now = phases.find((p) => p.state === "now");
  if (!now) {
    return phases.length ? "Every step is done. Thank you for your part in it." : null;
  }
  const next = phases.find((p) => p.state === "next");
  return next
    ? `${now.label} is in progress. ${next.label} comes after it.`
    : `${now.label} is in progress — the last step.`;
}
