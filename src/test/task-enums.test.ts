import { describe, expect, it } from "vitest";
// The real normalisers. They used to be copied into this file because
// actions.ts reaches `npm:` and `Deno` — a copy that passed whatever the real
// code did. They now live in task-fields.ts, which is pure, so these tests
// exercise the code that actually runs.
import {
  assigneeKind, taskPriority, taskStatus,
} from "../../supabase/functions/_shared/agents/task-fields";

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

describe("assignee kind decides whether the coding queue ever sees a task", () => {
  const KINDS = ["unassigned", "admin", "claude", "auto", "client", "agency"];

  // trg_fire_queue_on_ready refuses anything whose assignee_kind is not
  // 'claude' and logs not_queue_work; list_queue_projects filters the same
  // way. So the default here is the difference between an agent being able to
  // queue coding work and a task sitting in ready_for_claude forever.
  it("sends work bound for the queue to claude", () => {
    expect(assigneeKind(undefined, "ready_for_claude")).toBe("claude");
  });

  it("keeps everything else with the agency, as before", () => {
    expect(assigneeKind(undefined, "backlog")).toBe("agency");
  });

  it.each(KINDS)("passes %s through untouched", (k) => {
    expect(assigneeKind(k, "backlog")).toBe(k);
  });

  it.each(["", null, undefined, "robot", 7, {}])("maps %o into the enum", (input) => {
    expect(KINDS).toContain(assigneeKind(input, "backlog"));
    expect(KINDS).toContain(assigneeKind(input, "ready_for_claude"));
  });
});
