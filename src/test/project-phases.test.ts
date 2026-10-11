// The phase strip is a placeholder that reads off the task percentage, and
// the boundaries are arbitrary — which is exactly why they are pinned: a
// project at 0% showing "Now: Build", or one at 99% showing "Now: Release",
// looks like a real status and is not.
import { describe, it, expect } from "vitest";
import { PROJECT_PHASES, phaseStateAt } from "@/lib/projectPhases";

describe("phaseStateAt", () => {
  it("starts a project with nothing done in the first phase", () => {
    expect(phaseStateAt(0)).toBe(0);
    expect(PROJECT_PHASES[0]).toBe("Scope");
  });

  it("only reaches the last phase at 100", () => {
    // A release has happened or it has not; 99% is not "releasing".
    expect(phaseStateAt(99)).toBe(PROJECT_PHASES.length - 2);
    expect(phaseStateAt(100)).toBe(PROJECT_PHASES.length - 1);
  });

  it("spends most of the range in Build, which is where the work is", () => {
    expect(PROJECT_PHASES[phaseStateAt(30)]).toBe("Build");
    expect(PROJECT_PHASES[phaseStateAt(80)]).toBe("Build");
  });

  it("never returns an index outside the strip", () => {
    for (const p of [-50, -1, 0, 50, 100, 101, 9999, NaN]) {
      const i = phaseStateAt(p);
      expect(i, String(p)).toBeGreaterThanOrEqual(0);
      expect(i, String(p)).toBeLessThan(PROJECT_PHASES.length);
    }
  });
});
