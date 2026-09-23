// The project page's status logic.
//
// Small, but it decides what colour a client's page shows as — and the one
// rule worth pinning is that a change request beats a stale approval.
import { describe, it, expect } from "vitest";
import {
  pageState, groupSummary, folderOf, money, UNGROUPED, PAGE_STATE_STYLE,
} from "@/components/admin/project/projectPageTokens";

describe("pageState", () => {
  it("calls a page with open comments Changes, even when it was approved", () => {
    // The failure this prevents: a client approves on Monday, asks for a
    // change on Tuesday, and the row stays green because the approval row is
    // still there. The change then ships unbuilt.
    expect(pageState({ approved: true, comments: 2 })).toBe("changes");
  });

  it("calls an approved page with no comments Approved", () => {
    expect(pageState({ approved: true, comments: 0 })).toBe("approved");
  });

  it("calls everything else Awaiting", () => {
    expect(pageState({ approved: false, comments: 0 })).toBe("awaiting");
  });

  it("has a style for every state it can return", () => {
    for (const s of ["approved", "changes", "awaiting"] as const) {
      expect(PAGE_STATE_STYLE[s]?.label, s).toBeTruthy();
    }
  });
});

describe("groupSummary", () => {
  it("counts approvals within the folder", () => {
    expect(groupSummary(3, 2)).toBe("2 of 3 approved");
  });

  it("says empty rather than 0 of 0", () => {
    expect(groupSummary(0, 0)).toBe("empty");
  });
});

describe("folderOf", () => {
  it("files an ungrouped page under one name, not several", () => {
    // null, empty and whitespace are the same thing — three different labels
    // would split one folder into three in the tree.
    for (const raw of [null, undefined, "", "   "]) {
      expect(folderOf(raw), String(raw)).toBe(UNGROUPED);
    }
  });

  it("trims what someone typed", () => {
    expect(folderOf("  Onboarding ")).toBe("Onboarding");
  });
});

describe("money", () => {
  it("prints whole dollars the way the canvas does", () => {
    expect(money(400000)).toBe("$4,000");
    expect(money(200000)).toBe("$2,000");
    expect(money(0)).toBe("$0");
  });
});
