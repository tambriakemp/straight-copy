// The wording and filtering behind the social tab's status strip and batch list.
//
// Pure and separate from the components for the usual reason: "which batches
// count as needing review" and "what does this autonomy level mean for this
// client" are judgement calls, and judgement inside a component is judgement
// nobody can test.

export type AutonomyLevel = "inherit" | "propose" | "act_in_app" | "autonomous";

/**
 * What the autonomy pill says, in the second person about a named agent.
 *
 * Takes the agent's name rather than writing one in: four of the six have been
 * renamed, and a hardcoded "Iris" keeps rendering perfectly after a rename
 * while telling the reader something false.
 */
export function autonomyPill(level: AutonomyLevel | null, who: string): string {
  switch (level) {
    case "autonomous": return `${who} posts unattended`;
    case "propose": return `${who} is paused`;
    case "act_in_app": return `${who} holds for your review`;
    // `inherit` and null are the same thing — the column is null until someone
    // chooses. Saying "uses her default" is true but tells you nothing about
    // what will actually happen to this client's posts, which is the only
    // reason to read this pill.
    default: return `${who} follows her own setting`;
  }
}

/** True when the level means posts can go out without anyone reading them. */
export function postsUnattended(level: AutonomyLevel | null): boolean {
  return level === "autonomous";
}

export type BatchFilter = "all" | "needs_review" | "sent" | "errors";

export const BATCH_FILTERS: Array<{ key: BatchFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "needs_review", label: "Needs review" },
  { key: "sent", label: "Sent" },
  { key: "errors", label: "Errors" },
];

/**
 * Whether a batch belongs under a given filter chip.
 *
 * `drafting` counts as needing review on purpose. A batch still generating will
 * need reviewing the moment it finishes, and filing it under "all" only means
 * the person watching for work to do has to keep flipping back.
 */
export function matchesFilter(status: string, filter: BatchFilter): boolean {
  switch (filter) {
    case "needs_review": return status === "ready_for_review" || status === "drafting";
    case "sent": return status === "published" || status === "publishing";
    case "errors": return status === "error";
    default: return true;
  }
}
