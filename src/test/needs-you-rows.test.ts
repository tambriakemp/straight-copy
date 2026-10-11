// CRE-388/CRE-391: the brief's own markdown "Needs You", "Awaiting your
// approval" and "In flight / stuck" sections are retired — their structured
// rows now merge into the same list as the live Paperclip-pending cards,
// each carrying its own filter tag. Pure-logic coverage for that merge,
// same spirit as issue-links.test.ts / project-tags.test.ts.
import { describe, it, expect } from "vitest";
import {
  buildNeedsYouRows, liveItemToRow, narrativeItemToRow, approvalItemToRow, inFlightItemToRow,
  splitTodayRows,
} from "../lib/needsYouRows";
import type { NeedsYouItem } from "../lib/needsYouNow";
import type { ApprovalCard, InFlightItem, NeedsYouNarrativeItem } from "../lib/briefs";

describe("needsYouRows (CRE-388/CRE-391)", () => {
  it("defaults a live item's marker color to normal, except money items which default to high", () => {
    const agentsItem: NeedsYouItem = { id: "a1", kind: "interaction", bucket: "agents", title: "Needs your input", issue_identifier: "CRE-1", issue_url: "https://x/CRE-1", checkable: true };
    const moneyItem: NeedsYouItem = { id: "m1", kind: "overdue invoice", bucket: "money", title: "Overdue $500", issue_identifier: null, issue_url: "/admin/payments", checkable: true };
    expect(liveItemToRow(agentsItem).marker).toMatchObject({ color: "#eab308" });
    expect(liveItemToRow(moneyItem).marker).toMatchObject({ color: "#ea580c" });
  });

  it("carries a live item's bucket through as its tag, its kind as category, and its issue identifier as a single-entry taskIds", () => {
    const item: NeedsYouItem = { id: "a1", kind: "interaction", bucket: "agents", title: "Needs your input", issue_identifier: "CRE-335", issue_url: "https://x/CRE-335", checkable: true };
    const row = liveItemToRow(item);
    expect(row.tag).toBe("agents");
    expect(row.category).toBe("interaction");
    expect(row.taskIds).toEqual(["CRE-335"]);
    expect(row.source).toBe("live");
  });

  it("tags a kind:approval live item as 'approvals', not 'agents'", () => {
    const item: NeedsYouItem = { id: "p1", kind: "approval", bucket: "approvals", title: "Pending approval", issue_identifier: "CRE-9", issue_url: "https://x/CRE-9", checkable: false };
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

  // Superseded by the Admin Journeys canvas: options were folded into
  // nextStep as "Choose: Approve, Skip" while approvals shared one merged
  // list and had nowhere to put buttons. They now ride as a list and the
  // Decide card renders them — see "an approval's answers survive as data".
  it("tags an approval row 'approvals', keeps its options, and marks a deadline red", () => {
    const approval: ApprovalCard = {
      id: "appr-1", title: "Approve the Oct 12 prospect previews", context: "35 previews pending.",
      project: "Outreach", task_ids: ["CRE-291"], deadline: new Date(Date.now() + 4 * 86_400_000).toISOString(),
      options: ["Approve", "Skip"], link: "https://cre8visions.com/admin/approvals",
    };
    const row = approvalItemToRow(approval);
    expect(row).toMatchObject({
      id: "appr-1", source: "approval", tag: "approvals", category: "Outreach",
      taskIds: ["CRE-291"], href: "https://cre8visions.com/admin/approvals",
      nextStep: null,
      options: ["Approve", "Skip"],
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
      { id: "a1", kind: "interaction", bucket: "agents", title: "Live card", issue_identifier: null, issue_url: null, checkable: true },
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

  // CRE-393 §A.3: the same Paperclip issue showing up twice (a live sync
  // row and a brief's own narrative/approval line about it) is a real bug
  // CRE-355 hit — collapse to one row, approval wins over live wins over
  // in_flight wins over narrative.
  it("dedupes rows that share a Paperclip issue id, keeping the highest-priority source", () => {
    const live: NeedsYouItem[] = [
      { id: "live-1", kind: "interaction", bucket: "agents", title: "Live version", issue_identifier: "CRE-355", issue_url: null, checkable: false },
    ];
    const narrative: NeedsYouNarrativeItem[] = [
      { id: "narr-1", title: "Narrative version", category: "cre8visions.com", task_ids: ["CRE-355"] },
    ];
    const rows = buildNeedsYouRows({ live, narrative });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "live", title: "Live version" });
  });

  it("keeps an approval over a live/narrative row naming the same issue, so it never also sits in Do", () => {
    const approvals: ApprovalCard[] = [
      { id: "appr-351", title: "Decide on CRE-351", project: "Health", task_ids: ["CRE-351"] },
    ];
    const live: NeedsYouItem[] = [
      { id: "live-351", kind: "interaction", bucket: "agents", title: "Live duplicate", issue_identifier: "CRE-351", issue_url: null, checkable: true },
    ];
    const rows = buildNeedsYouRows({ live, approvals });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("approval");
    const { decide, todo } = splitTodayRows(rows);
    expect(decide.map((r) => r.id)).toEqual(["appr-351"]);
    expect(todo).toEqual([]);
  });

  it("does not dedupe rows with no issue id just because both lack one", () => {
    const live: NeedsYouItem[] = [
      { id: "live-x", kind: "overdue invoice", bucket: "money", title: "Overdue", issue_identifier: null, issue_url: null, checkable: true },
    ];
    const narrative: NeedsYouNarrativeItem[] = [
      { id: "narr-y", title: "Unrelated note", category: "Menovia" },
    ];
    expect(buildNeedsYouRows({ live, narrative })).toHaveLength(2);
  });

  it("marks a live row not checkable when the source item says so (agent-owned, stalled)", () => {
    const live: NeedsYouItem[] = [
      { id: "stalled-1", kind: "interaction", bucket: "agents", title: "Stalled review", issue_identifier: "CRE-350", issue_url: null, checkable: false },
    ];
    expect(liveItemToRow(live[0]).checkable).toBe(false);
  });
});

describe("splitTodayRows", () => {
  const approval = approvalItemToRow({
    id: "a1",
    title: "Health release: answer decisions 1, 3 and 4",
    project: "Menovia",
    context: "Each has a recommended default.",
    waiting_since: "Oct 8",
    deadline: null,
    options: ["Use defaults", "Answer each"],
    task_ids: ["CRE-342", "CRE-343"],
  });

  it("puts an approval in Decide and everything else in Do", () => {
    // By source, not by tag. A stuck build has nobody waiting on an answer
    // from you — it is work, so it belongs in Do however it is tagged.
    const stuck = inFlightItemToRow({
      id: "f1", title: "Verify push campaigns", status: "stuck", category: "Menovia",
    });
    const mine = narrativeItemToRow({
      id: "n1", title: "Cancel the Runway Pro trial", category: "cre8visions.com",
    });
    const { decide, todo } = splitTodayRows([stuck, approval, mine]);
    expect(decide.map((r) => r.id)).toEqual(["a1"]);
    expect(todo.map((r) => r.id)).toEqual(["f1", "n1"]);
  });

  it("keeps each list in the order the brief gave", () => {
    const a2 = approvalItemToRow({ id: "a2", title: "Merge PR #576", project: "Menovia" });
    const { decide } = splitTodayRows([approval, a2]);
    expect(decide.map((r) => r.id)).toEqual(["a1", "a2"]);
  });

  it("handles a day with nothing to decide", () => {
    const mine = narrativeItemToRow({ id: "n1", title: "Re-submit the sitemap", category: "Menovia" });
    const { decide, todo } = splitTodayRows([mine]);
    expect(decide).toEqual([]);
    expect(todo).toHaveLength(1);
  });
});

describe("an approval's answers survive as data", () => {
  it("carries options, waiting_since and deadline onto the row", () => {
    // CRE-391 flattened these into "Choose: a, b" in the next-step line
    // because the merged row had nowhere to put them. The Decide card
    // renders them as buttons, so they have to arrive as a list again.
    const row = approvalItemToRow({
      id: "a1",
      title: "Approve the Oct 12 prospect previews",
      project: "Outreach",
      waiting_since: "Oct 6",
      deadline: "Mon Oct 12, 9:00 AM",
      options: ["Review previews"],
    });
    expect(row.options).toEqual(["Review previews"]);
    expect(row.waitingSince).toBe("Oct 6");
    expect(row.deadline).toBe("Mon Oct 12, 9:00 AM");
  });

  it("no longer repeats them in the next-step line", () => {
    // Said twice, a button and a sentence read as two different
    // instructions for the same decision.
    const row = approvalItemToRow({
      id: "a1", title: "Merge PR #575", project: "Menovia",
      options: ["Merge", "Review first"],
    });
    expect(row.nextStep).toBeNull();
  });

  it("gives a row with no options an empty list, not undefined", () => {
    const row = approvalItemToRow({ id: "a1", title: "Something", project: "Menovia" });
    expect(row.options).toEqual([]);
  });
});
