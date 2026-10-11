// Every one of these counts is a decision nobody can see in a screenshot:
// which statuses are open, whether a blocked task still counts as unfinished,
// what a project with no tasks shows as a percentage. The bar renders either
// way, which is what makes them worth pinning.
import { describe, it, expect } from "vitest";
import { countByProject, countsFor, sumCounts, EMPTY_COUNTS, type TaskRow } from "@/lib/taskCounts";

const rows: TaskRow[] = [
  { client_project_id: "a", status: "complete" },
  { client_project_id: "a", status: "complete" },
  { client_project_id: "a", status: "blocked" },
  { client_project_id: "a", status: "needs_review" },
  { client_project_id: "b", status: "backlog" },
];

describe("countByProject", () => {
  it("splits rows by project", () => {
    const c = countByProject(rows);
    expect([...c.keys()].sort()).toEqual(["a", "b"]);
    expect(c.get("a")!.total).toBe(4);
    expect(c.get("b")!.total).toBe(1);
  });

  it("counts a blocked task as open, not as done", () => {
    // It is not finished. A bar that fills for it says the work is over.
    const a = countByProject(rows).get("a")!;
    expect(a.done).toBe(2);
    expect(a.open).toBe(2);
    expect(a.blocked).toBe(1);
  });

  it("counts a needs-review task as open too", () => {
    const a = countByProject(rows).get("a")!;
    expect(a.needsReview).toBe(1);
    expect(a.done + a.open).toBe(a.total);
  });

  it("leaves out a project with no rows", () => {
    expect(countByProject(rows).has("c")).toBe(false);
  });

  it("is empty for no rows at all", () => {
    expect(countByProject([]).size).toBe(0);
  });
});

describe("countsFor", () => {
  it("gives zeroes rather than undefined for a project with no tasks", () => {
    // Otherwise the page prints "NaN%" for every project nobody has
    // written a task for yet, which is most of them on day one.
    expect(countsFor(countByProject(rows), "nope")).toEqual(EMPTY_COUNTS);
    expect(EMPTY_COUNTS.pct).toBe(0);
  });
});

describe("percentage", () => {
  it("is floored, so one task left is never 100%", () => {
    const almost: TaskRow[] = Array.from({ length: 345 }, (_, i) => ({
      client_project_id: "p",
      status: i < 344 ? "complete" : "backlog",
    }));
    expect(countByProject(almost).get("p")!.pct).toBe(99);
  });

  it("is 100 only when everything is complete", () => {
    const done: TaskRow[] = [
      { client_project_id: "p", status: "complete" },
      { client_project_id: "p", status: "complete" },
    ];
    expect(countByProject(done).get("p")!.pct).toBe(100);
  });

  it("is 0, not 100, for a project with no tasks", () => {
    expect(EMPTY_COUNTS.pct).toBe(0);
  });
});

describe("sumCounts", () => {
  it("adds projects up and recomputes the percentage over the whole", () => {
    // Not the average of the percentages: a 1-task project at 100% and a
    // 99-task project at 0% is 1%, not 50%.
    const total = sumCounts([
      { total: 1, done: 1, open: 0, blocked: 0, needsReview: 0, pct: 100 },
      { total: 99, done: 0, open: 99, blocked: 0, needsReview: 0, pct: 0 },
    ]);
    expect(total.total).toBe(100);
    expect(total.done).toBe(1);
    expect(total.pct).toBe(1);
  });

  it("is all zeroes for nothing", () => {
    expect(sumCounts([])).toEqual(EMPTY_COUNTS);
  });
});
