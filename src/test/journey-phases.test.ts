// What this decides is what a client believes about their own project.
// A ladder showing "Now: Design" after design finished is the client not
// chasing something they should chase, and reading the page as
// decoration from then on.
import { describe, it, expect } from "vitest";
import { phaseLadder, phaseSummary, isDone, PHASE_WORD, type PhaseNode } from "@/lib/journeyPhases";

const n = (o: Partial<PhaseNode> & { id: string; order_index: number }): PhaseNode => ({
  key: o.id, label: o.id, status: "pending", ...o,
});

describe("isDone", () => {
  it("accepts every spelling the status column has carried", () => {
    for (const s of ["complete", "completed", "done", "client_submitted", "approved", "skipped", "COMPLETE"]) {
      expect(isDone(n({ id: "a", order_index: 0, status: s })), s).toBe(true);
    }
  });

  it("takes a completion timestamp over whatever the status says", () => {
    // The two disagree in real rows: a node finished by one writer and
    // left at its old status by another.
    expect(isDone(n({ id: "a", order_index: 0, status: "in_progress", completed_at: "2026-09-01" }))).toBe(true);
  });

  it("treats anything it does not recognise as not done", () => {
    for (const s of ["", null, "pending", "in_progress", "blocked", "waiting"]) {
      expect(isDone(n({ id: "a", order_index: 0, status: s })), String(s)).toBe(false);
    }
  });
});

describe("phaseLadder", () => {
  const nodes = [
    n({ id: "kickoff", order_index: 0, status: "complete" }),
    n({ id: "design", order_index: 1, status: "in_progress" }),
    n({ id: "build", order_index: 2 }),
    n({ id: "review", order_index: 3 }),
    n({ id: "launch", order_index: 4 }),
  ];

  it("reads Done, Now, Next, then Later", () => {
    expect(phaseLadder(nodes).map((p) => p.state))
      .toEqual(["done", "now", "next", "later", "later"]);
  });

  it("sorts by order_index rather than trusting the array", () => {
    expect(phaseLadder([nodes[3], nodes[0], nodes[2], nodes[1], nodes[4]]).map((p) => p.label))
      .toEqual(["kickoff", "design", "build", "review", "launch"]);
  });

  it("calls the first UNFINISHED node Now, even if nobody started it", () => {
    // A node nobody remembered to start is still the next thing that has
    // to happen. A ladder with no Now at all reads as a project that has
    // stopped.
    const out = phaseLadder([
      n({ id: "a", order_index: 0, status: "complete" }),
      n({ id: "b", order_index: 1, status: "pending" }),
    ]);
    expect(out[1].state).toBe("now");
  });

  it("keeps work finished out of order as done", () => {
    // Demoting it would tell the client it has to happen again.
    const out = phaseLadder([
      n({ id: "a", order_index: 0, status: "pending" }),
      n({ id: "b", order_index: 1, status: "complete" }),
    ]);
    expect(out.map((p) => p.state)).toEqual(["now", "done"]);
  });

  it("has no Now once everything is finished", () => {
    const out = phaseLadder([
      n({ id: "a", order_index: 0, status: "complete" }),
      n({ id: "b", order_index: 1, status: "complete" }),
    ]);
    expect(out.every((p) => p.state === "done")).toBe(true);
  });

  it("is empty for a project with no journey, rather than inventing one", () => {
    expect(phaseLadder([])).toEqual([]);
  });

  it("names every state it can return", () => {
    for (const p of phaseLadder(nodes)) expect(PHASE_WORD[p.state]).toBeTruthy();
  });
});

describe("phaseSummary", () => {
  it("says what is happening and what follows", () => {
    expect(phaseSummary(phaseLadder([
      n({ id: "Design", order_index: 0, status: "pending" }),
      n({ id: "Build", order_index: 1 }),
    ]))).toBe("Design is in progress. Build comes after it.");
  });

  it("says so when the thing in progress is the last step", () => {
    expect(phaseSummary(phaseLadder([n({ id: "Launch", order_index: 0 })])))
      .toBe("Launch is in progress — the last step.");
  });

  it("reads a finished project as finished, not as 'Now: nothing'", () => {
    expect(phaseSummary(phaseLadder([n({ id: "a", order_index: 0, status: "complete" })])))
      .toBe("Every step is done. Thank you for your part in it.");
  });

  it("says nothing at all when there is no journey", () => {
    expect(phaseSummary([])).toBeNull();
  });
});
