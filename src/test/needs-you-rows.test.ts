// CRE-388/CRE-391: the brief's own markdown "Needs You", "Awaiting your
// approval" and "In flight / stuck" sections are retired — their structured
// rows now merge into the same list as the live Paperclip-pending cards,
// each carrying its own filter tag. Pure-logic coverage for that merge,
// same spirit as issue-links.test.ts / project-tags.test.ts.
import { describe, it, expect } from "vitest";
import {
  buildNeedsYouRows, liveItemToRow, narrativeItemToRow, approvalItemToRow, inFlightItemToRow,
} from "../lib/needsYouRows";
import type { NeedsYouItem } from "../lib/needsYouNow";
import type { ApprovalCard, InFlightItem, NeedsYouNarrativeItem } from "../lib/briefs";

describe("needsYouRows (CRE-388/CRE-391)", () => {
  it("defaults a live item's marker color to normal, except money items which default to high", () => {
    const agentsItem: NeedsYouItem = { id: "a1", kind: "interaction", bucket: "agents", title: "Needs your input", issue_identifier: "CRE-1", issue_url: "https://x/CRE-1" };
    const moneyItem: NeedsYouItem = { id: "m1", kind: "overdue invoice", bucket: "money", title: "Overdue $500", issue_identifier: null, issue_url: "/admin/payments" };
    expect(liveItemToRow(agentsItem).marker).toMatchObject({ color: "#eab308" });
    expect(liveItemToRow(moneyItem).marker).toMatchObject({ color: "#ea580c" });
  });

  it("carries a live item's bucket through as its tag, its kind as category, and its issue identifier as a single-entry taskIds", () => {
    const item: NeedsYouItem = { id: "a1", kind: "interaction", bucket: "agents", title: "Needs your input", issue_identifier: "CRE-335", issue_url: "https://x/CRE-335" };
    const row = liveItemToRow(item);
    expect(row.tag).toBe("agents");
    expect(row.category).toBe("interaction");
    expect(row.taskIds).toEqual(["CRE-335"]);
    expect(row.source).toBe("live");
  });

  it("tags a kind:approval live item as 'approvals', not 'agents'", () => {
    const item: NeedsYouItem = { id: "p1", kind: "approval", bucket: "approvals", title: "Pending approval", issue_identifier: "CRE-9", issue_url: "https://x/CRE-9" };
    expect(liveItemToRow(item).tag).toBe("approvals");
  });

  it("maps a narrative item's own fields through, defaulting priority and tag when absent", () => {
    const withBoth: NeedsYouNarrativeItem = {
      id: "n1", title: "Decide on the Lovable prompt", body: "Two options for the deploy.",
      next_step: "Pick A or B and reply here.", priority: "high", category: "cre8visions.com",
      task_ids: ["CRE-388"], tag: "money",
    };
    const withNeither: NeedsYouNarrativeItem = { id: "n2", title: "FYI only", category: "Menovia" };
    expect(narrativeItemToRow(withBoth)).toMatchObject({
      id: "n1", source: "narrative", tag: "money", title: "Decide on the Lovable prompt",
      description: "Two options for the deploy.", nextStep: "Pick A or B and reply here.",
      category: "cre8visions.com", taskIds: ["CRE-388"],
    });
    expect(narrativeItemToRow(withBoth).marker).toMatchObject({ color: "#ea580c" });
    expect(narrativeItemToRow(withNeither).tag).toBe("agents");
    expect(narrativeItemToRow(withNeither).marker).toMatchObject({ color: "#eab308" });
    expect(narrativeItemToRow(withNeither).taskIds).toEqual([]);
  });

  it("tags an approval row 'approvals', folds options into nextStep, and marks a deadline red", () => {
    const approval: ApprovalCard = {
      id: "appr-1", title: "Approve the Oct 12 prospect previews", context: "35 previews pending.",
      project: "Outreach", task_ids: ["CRE-291"], deadline: new Date(Date.now() + 4 * 86_400_000).toISOString(),
      options: ["Approve", "Skip"], link: "https://cre8visions.com/admin/approvals",
    };
    const row = approvalItemToRow(approval);
    expect(row).toMatchObject({
      id: "appr-1", source: "approval", tag: "approvals", category: "Outreach",
      taskIds: ["CRE-291"], href: "https://cre8visions.com/admin/approvals",
      nextStep: "Choose: Approve, Skip",
    });
    expect(row.marker).toMatchObject({ color: "#db2777", label: "Has a deadline" });
  });

  it("marks an approval with no deadline and no waiting_since as neutral/new", () => {
    const approval: ApprovalCard = { id: "appr-2", title: "Fresh ask", project: "Inbox" };
    expect(approvalItemToRow(approval).marker).toMatchObject({ color: "#9ca3af", label: "New" });
  });

  it("tags an in-flight row 'in_flight' with a status icon marker", () => {
    const item: InFlightItem = { id: "if-1", title: "Menovia App Store review", status: "stuck", category: "Menovia", task_ids: ["CRE-351"] };
    const row = inFlightItemToRow(item);
    expect(row).toMatchObject({ id: "if-1", source: "in_flight", tag: "in_flight", category: "Menovia", taskIds: ["CRE-351"] });
    expect(row.marker).toMatchObject({ kind: "icon", color: "#dc2626", label: "Stuck" });
  });

  it("merges every source, live first, then approvals, then in-flight, then narrative", () => {
    const live: NeedsYouItem[] = [
      { id: "a1", kind: "interaction", bucket: "agents", title: "Live card", issue_identifier: null, issue_url: null },
    ];
    const approvals: ApprovalCard[] = [{ id: "appr-1", title: "Approval row", project: "Outreach" }];
    const inFlight: InFlightItem[] = [{ id: "if-1", title: "In-flight row", status: "blocked", category: "Menovia" }];
    const narrative: NeedsYouNarrativeItem[] = [{ id: "n1", title: "Narrative row", category: "Outreach" }];
    const rows = buildNeedsYouRows({ live, approvals, inFlight, narrative });
    expect(rows.map((r) => r.id)).toEqual(["a1", "appr-1", "if-1", "n1"]);
  });

  it("tolerates every arg being null, undefined, or omitted", () => {
    expect(buildNeedsYouRows({})).toEqual([]);
    expect(buildNeedsYouRows({ live: null, narrative: undefined, approvals: null, inFlight: undefined })).toEqual([]);
  });
});
