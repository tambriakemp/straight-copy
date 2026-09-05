// How an agent's words become the enum values project_tasks actually accepts.
//
// Pure and dependency-free on purpose: actions.ts reaches npm: specifiers that
// the frontend test runner cannot resolve, so these mappings used to be
// untestable and were pinned by a copy of the logic inside the test file — a
// copy that could not fail when the real thing changed. They live here so the
// tests exercise the code that runs.

/**
 * project_tasks.priority is an enum: low | normal | high | urgent.
 *
 * There is no "medium" — which is the word any model reaches for first, and it
 * failed the insert with a raw Postgres enum error rather than doing the
 * obvious thing.
 */
const TASK_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
export function taskPriority(raw: unknown): string {
  const v = String(raw ?? "").toLowerCase();
  if (TASK_PRIORITIES.has(v)) return v;
  if (v === "medium" || v === "med" || v === "moderate") return "normal";
  if (v === "critical" || v === "highest" || v === "p0") return "urgent";
  return "normal";
}

/**
 * project_tasks.status is an enum: backlog | ready_for_claude | in_progress |
 * needs_review | blocked | complete.
 *
 * There is no "todo" — which is the word both this code and any model reach for
 * first, and it failed every insert with "invalid input value for enum
 * project_task_status". Every task an agent tried to open died on it, so a run
 * that had done the thinking still produced nothing on the board.
 *
 * Same shape as taskPriority above, and for the same reason: the enum is the
 * schema's vocabulary, not the caller's, so translate rather than reject.
 */
const TASK_STATUSES = new Set([
  "backlog", "ready_for_claude", "in_progress", "needs_review", "blocked", "complete",
]);
export function taskStatus(raw: unknown): string {
  const v = String(raw ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (TASK_STATUSES.has(v)) return v;
  if (v === "todo" || v === "to_do" || v === "open" || v === "new" || v === "pending") {
    return "backlog";
  }
  if (v === "doing" || v === "started" || v === "active") return "in_progress";
  if (v === "review" || v === "in_review") return "needs_review";
  if (v === "done" || v === "closed" || v === "finished") return "complete";
  return "backlog";
}

/**
 * project_tasks.assignee_kind is its own enum, and the queue reads it as the
 * single answer to "is this coding work".
 *
 * This used to be hardcoded to 'agency' at every insert, which quietly made
 * agent-created queue work impossible: trg_fire_queue_on_ready refuses
 * anything not assigned to claude and logs `not_queue_work`, and
 * list_queue_projects filters the same way. So an agent could put a task in
 * ready_for_claude and the coding queue would never see it — no error
 * anywhere, just a task sitting in a column forever.
 *
 * Default follows the column it lands in: work headed for the coding queue is
 * Claude's, anything else is the agency's, and an explicit value always wins.
 */
const ASSIGNEE_KINDS = new Set([
  "unassigned", "admin", "claude", "auto", "client", "agency",
]);
export function assigneeKind(raw: unknown, status: string): string {
  const v = String(raw ?? "").toLowerCase().trim();
  if (ASSIGNEE_KINDS.has(v)) return v;
  if (v === "ai" || v === "agent" || v === "claude_code") return "claude";
  return status === "ready_for_claude" ? "claude" : "agency";
}

/**
 * Whether the coding queue can actually run work on a project.
 *
 * The same two conditions trg_fire_queue_on_ready checks before firing and
 * list_queue_projects checks before listing. Duplicated in three places in SQL
 * already; this is the one the prompt side reads, so an agent can see that
 * promoting a task on this board would only produce a `not_queue_work` row.
 */
export function projectQueueReady(
  project: { queue_enabled?: boolean | null; repo_url?: string | null },
): boolean {
  return !!project.queue_enabled && !!(project.repo_url ?? "").trim();
}

/**
 * Whether a task sitting in ready_for_claude will actually be collected.
 *
 * Status alone does not decide it: the trigger refuses anything not assigned to
 * claude, and a task another run already holds is not waiting for a new one. A
 * task that fails this looks queued and is not, which is invisible unless
 * something says so out loud.
 */
export function willBePickedUp(
  task: { assignee_kind?: string | null; claimed_by?: string | null },
): boolean {
  return task.assignee_kind === "claude" && !task.claimed_by;
}
