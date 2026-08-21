import { describe, expect, it } from "vitest";

/**
 * The enum vocabularies, mirrored from the migrations so a rename shows up as a
 * failing test rather than a failing insert in production.
 *
 * Both of these bit for real. `priority: "medium"` and `status: "todo"` are the
 * words this code and any model reach for first, and neither is in its enum —
 * so `invalid input value for enum project_task_status: "todo"` failed every
 * task an agent tried to open. A run that had done the thinking put nothing on
 * the board.
 */
const STATUSES = ["backlog", "ready_for_claude", "in_progress", "needs_review", "blocked", "complete"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

// Copies of the normalisers in actions.ts. That module imports `npm:` and
// `Deno`, so it cannot be imported here — see the note in CLAUDE.md.
const TASK_STATUSES = new Set(STATUSES);
function taskStatus(raw: unknown): string {
  const v = String(raw ?? "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (TASK_STATUSES.has(v)) return v;
  if (v === "todo" || v === "to_do" || v === "open" || v === "new" || v === "pending") return "backlog";
  if (v === "doing" || v === "started" || v === "active") return "in_progress";
  if (v === "review" || v === "in_review") return "needs_review";
  if (v === "done" || v === "closed" || v === "finished") return "complete";
  return "backlog";
}

const TASK_PRIORITIES = new Set(PRIORITIES);
function taskPriority(raw: unknown): string {
  const v = String(raw ?? "").toLowerCase();
  if (TASK_PRIORITIES.has(v)) return v;
  if (v === "medium" || v === "med" || v === "moderate") return "normal";
  if (v === "critical" || v === "highest" || v === "p0") return "urgent";
  return "normal";
}

describe("task status never leaves the enum", () => {
  // The exact value that failed in production on 21 Aug, twice in one run.
  it("turns the word that broke every task creation into a real status", () => {
    expect(taskStatus("todo")).toBe("backlog");
  });

  it.each(["todo", "to do", "To-Do", "open", "new", "pending", "doing", "done", "review", "", null, undefined, 42, {}])(
    "maps %o into the enum",
    (input) => {
      expect(STATUSES).toContain(taskStatus(input));
    },
  );

  it.each(STATUSES)("passes %s through untouched", (s) => {
    expect(taskStatus(s)).toBe(s);
  });

  it("keeps the sense of the word rather than dumping everything in backlog", () => {
    expect(taskStatus("doing")).toBe("in_progress");
    expect(taskStatus("done")).toBe("complete");
    expect(taskStatus("in review")).toBe("needs_review");
  });
});

describe("task priority never leaves the enum", () => {
  it("turns medium — which is not a priority here — into normal", () => {
    expect(taskPriority("medium")).toBe("normal");
  });

  it.each(["medium", "critical", "p0", "", null, undefined, 7])("maps %o into the enum", (input) => {
    expect(PRIORITIES).toContain(taskPriority(input));
  });

  it.each(PRIORITIES)("passes %s through untouched", (p) => {
    expect(taskPriority(p)).toBe(p);
  });
});
