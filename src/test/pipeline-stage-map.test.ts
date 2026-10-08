import { describe, it, expect } from "vitest";
import {
  BOARD_COLUMNS,
  VISIBLE_BOARD_COLUMNS,
  columnForPosition,
  isRevisedFlag,
  columnLabel,
} from "../../supabase/functions/_shared/pipeline-stage-map";

// Mirrors the live "Cre8 Prospect" pipeline after the CRE-332 renames
// (see CRE-332's Oct 7, 2026 comment with the real GET response):
// 0 Lead, 1 Intake, 2 Demo Scheduled, 3 Proposal Sent, 4 In Negotiation,
// 5 Signed, 6 Won, 7 Lost.
describe("pipeline-stage-map", () => {
  it("maps every live position to the approved board column", () => {
    expect(columnForPosition(0)).toBe("lead");
    expect(columnForPosition(1)).toBe("intake");
    expect(columnForPosition(2)).toBe("intake"); // Demo Scheduled folds in
    expect(columnForPosition(3)).toBe("proposalSent");
    expect(columnForPosition(4)).toBe("proposalSent"); // In Negotiation folds in
    expect(columnForPosition(5)).toBe("signed");
    expect(columnForPosition(6)).toBe("won");
    expect(columnForPosition(7)).toBe("lost");
  });

  it("returns null for a position outside the known pipeline", () => {
    expect(columnForPosition(99)).toBeNull();
  });

  it("flags only In Negotiation (position 4) as Revised", () => {
    expect(isRevisedFlag(4)).toBe(true);
    expect(isRevisedFlag(3)).toBe(false);
    expect(isRevisedFlag(5)).toBe(false);
  });

  it("labels Won as 'Deposit paid', per Bree's approved mapping", () => {
    expect(columnLabel("won")).toBe("Deposit paid");
  });

  it("excludes Lost from the visible board columns", () => {
    expect(VISIBLE_BOARD_COLUMNS.some((c) => c.key === "lost")).toBe(false);
    expect(BOARD_COLUMNS.some((c) => c.key === "lost")).toBe(true);
  });

  it("covers every column exactly once with no gaps across positions 0-7", () => {
    const covered = new Set<number>();
    for (const col of BOARD_COLUMNS) for (const p of col.positions) covered.add(p);
    expect([...covered].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
