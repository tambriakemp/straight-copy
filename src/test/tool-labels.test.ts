// The progress line is what makes a two-minute turn read as work rather than a
// hang, so the phrasing is pinned here rather than reconstructed in the UI.
import { describe, it, expect } from "vitest";
import { stepLabel, resultLabel } from "../../supabase/functions/_shared/agents/tool-labels";

describe("stepLabel", () => {
  it("names what it is searching and for what", () => {
    expect(stepLabel("search", { entity: "client", q: "Menovia" }))
      .toBe("Searching clients for “Menovia”");
  });

  it("distinguishes counting from listing", () => {
    expect(stepLabel("query", { table: "project_invoices", count_only: true }))
      .toBe("Counting invoices");
    expect(stepLabel("query", { table: "project_invoices" }))
      .toBe("Looking through invoices");
  });

  it("reads a single record in the singular", () => {
    expect(stepLabel("get_record", { table: "client_proposals" })).toBe("Reading a proposal");
    expect(stepLabel("get_record", { table: "project_tasks" })).toBe("Reading a task");
  });

  it("names the action being proposed", () => {
    expect(stepLabel("propose_action", { kind: "delete_record", title: "Remove test invoice" }))
      .toBe("Proposing a deletion: Remove test invoice");
  });

  it("stays readable for a table it has no noun for", () => {
    const label = stepLabel("query", { table: "some_new_table" });
    expect(label).toBe("Looking through some new table");
  });

  it("never produces a runaway line", () => {
    const long = "x".repeat(500);
    for (const label of [
      stepLabel("search", { entity: "client", q: long }),
      stepLabel("propose_action", { kind: "create_task", title: long }),
      stepLabel("web_search", { query: long }),
    ]) {
      expect(label.length).toBeLessThan(120);
    }
  });

  it("falls back rather than throwing on an unknown tool", () => {
    expect(stepLabel("brand_new_tool", {})).toBe("Running brand new tool");
  });

  it("survives missing input entirely", () => {
    for (const name of ["search", "query", "get_record", "propose_action", "web_search"]) {
      expect(typeof stepLabel(name, {})).toBe("string");
    }
  });
});

describe("resultLabel", () => {
  it("says plainly when nothing matched", () => {
    // "0 results" reads as a bug; "Nothing matched" reads as an answer.
    expect(resultLabel("search", { ok: true, count: 0 })).toBe("Nothing matched");
  });

  it("counts with the right plural", () => {
    expect(resultLabel("search", { ok: true, count: 1 })).toBe("1 result");
    expect(resultLabel("search", { ok: true, count: 4 })).toBe("4 results");
  });

  it("surfaces a failure", () => {
    expect(resultLabel("query", { ok: false, note: "that table is not readable" }))
      .toBe("that table is not readable");
  });
});
