// CRE-388: the brief's own markdown "Needs You" section is retired —
// its structured rows (Brief.needs_you) now merge into the same list as
// the live Paperclip-pending cards. Pure-logic coverage for that merge,
// same spirit as issue-links.test.ts / project-tags.test.ts.
import { describe, it, expect } from "vitest";
import { buildNeedsYouRows, liveItemToRow, narrativeItemToRow } from "../lib/needsYouRows";
import type { NeedsYouItem } from "../lib/needsYouNow";
import type { NeedsYouNarrativeItem } from "../lib/briefs";

describe("needsYouRows (CRE-388)", () => {
  it("defaults a live item's priority to normal, except money items which default to high", () => {
    const agentsItem: NeedsYouItem = { id: "a1", kind: "approval", bucket: "agents", title: "Approve copy", issue_identifier: "CRE-1", issue_url: "https://x/CRE-1" };
    const moneyItem: NeedsYouItem = { id: "m1", kind: "overdue invoice", bucket: "money", title: "Overdue $500", issue_identifier: null, issue_url: "/admin/payments" };
    expect(liveItemToRow(agentsItem).priority).toBe("normal");
    expect(liveItemToRow(moneyItem).priority).toBe("high");
  });

  it("carries a live item's kind through as its category, and its issue identifier as a single-entry taskIds", () => {
    const item: NeedsYouItem = { id: "a1", kind: "interaction", bucket: "agents", title: "Needs your input", issue_identifier: "CRE-335", issue_url: "https://x/CRE-335" };
    const row = liveItemToRow(item);
    expect(row.category).toBe("interaction");
    expect(row.taskIds).toEqual(["CRE-335"]);
    expect(row.source).toBe("live");
  });

  it("maps a narrative item's own fields through, defaulting priority to normal when absent", () => {
    const withPriority: NeedsYouNarrativeItem = {
      id: "n1", title: "Decide on the Lovable prompt", body: "Two options for the deploy.",
      next_step: "Pick A or B and reply here.", priority: "high", category: "cre8visions.com", task_ids: ["CRE-388"],
    };
    const withoutPriority: NeedsYouNarrativeItem = { id: "n2", title: "FYI only", category: "Menovia" };
    expect(narrativeItemToRow(withPriority)).toMatchObject({
      id: "n1", source: "narrative", title: "Decide on the Lovable prompt",
      description: "Two options for the deploy.", nextStep: "Pick A or B and reply here.",
      category: "cre8visions.com", priority: "high", taskIds: ["CRE-388"],
    });
    expect(narrativeItemToRow(withoutPriority).priority).toBe("normal");
    expect(narrativeItemToRow(withoutPriority).taskIds).toEqual([]);
  });

  it("merges live cards and narrative rows, live first, into one list", () => {
    const live: NeedsYouItem[] = [
      { id: "a1", kind: "approval", bucket: "agents", title: "Live card", issue_identifier: null, issue_url: null },
    ];
    const narrative: NeedsYouNarrativeItem[] = [
      { id: "n1", title: "Narrative row", category: "Outreach" },
    ];
    const rows = buildNeedsYouRows(live, narrative);
    expect(rows.map((r) => r.id)).toEqual(["a1", "n1"]);
  });

  it("tolerates null live items and a missing narrative array", () => {
    expect(buildNeedsYouRows(null, undefined)).toEqual([]);
    expect(buildNeedsYouRows(null, null)).toEqual([]);
  });
});
