// The gate that decides whether a client's post goes out unattended.
//
// Two functions compose to make that decision, and getting either wrong is
// invisible until it is very visible — a post published under a client's brand
// that nobody read, or an agent that quietly stopped acting. These pin both,
// and pin that the five agents which do not use per-project overrides are
// completely unaffected by their existence.
import { describe, it, expect } from "vitest";
import {
  resolveAutonomy,
  canAutoExecute,
} from "../../supabase/functions/_shared/agents/types";

describe("resolveAutonomy", () => {
  it("inherits the agent's level when the project says nothing", () => {
    expect(resolveAutonomy("propose", null)).toBe("propose");
    expect(resolveAutonomy("act_in_app", null)).toBe("act_in_app");
    expect(resolveAutonomy("autonomous", null)).toBe("autonomous");
    expect(resolveAutonomy("act_in_app", undefined)).toBe("act_in_app");
    expect(resolveAutonomy("act_in_app", "")).toBe("act_in_app");
  });

  it("lets a project widen the agent's level", () => {
    // The requirement: a trusted client posts unattended under an agent that
    // otherwise waits for approval.
    expect(resolveAutonomy("act_in_app", "autonomous")).toBe("autonomous");
  });

  it("lets a project narrow the agent's level", () => {
    // The new-client hold. Iris runs autonomous; a project fresh off the
    // trigger sits at act_in_app until someone clears it.
    expect(resolveAutonomy("autonomous", "act_in_app")).toBe("act_in_app");
    expect(resolveAutonomy("autonomous", "propose")).toBe("propose");
  });

  it("never lets a project widen an agent set to propose", () => {
    // propose is the kill switch. A per-project grant that survived it would
    // make the switch a lie.
    expect(resolveAutonomy("propose", "autonomous")).toBe("propose");
    expect(resolveAutonomy("propose", "act_in_app")).toBe("propose");
  });

  it("falls back to the agent on anything unrecognised, and never widens", () => {
    expect(resolveAutonomy("act_in_app", "AUTONOMOUS")).toBe("act_in_app");
    expect(resolveAutonomy("act_in_app", "full")).toBe("act_in_app");
    expect(resolveAutonomy("act_in_app", "yes")).toBe("act_in_app");
    expect(resolveAutonomy("propose", "garbage")).toBe("propose");
  });
});

describe("canAutoExecute", () => {
  it("keeps the behaviour the five existing agents rely on", () => {
    // Regression pins. Nothing about adding a fourth parameter may move these.
    expect(canAutoExecute("propose", false)).toBe(false);
    expect(canAutoExecute("propose", true)).toBe(false);
    expect(canAutoExecute("act_in_app", false)).toBe(true);
    expect(canAutoExecute("act_in_app", true)).toBe(false);
    expect(canAutoExecute("autonomous", false)).toBe(true);
    expect(canAutoExecute("autonomous", true)).toBe(true);
    expect(canAutoExecute("autonomous", true, true)).toBe(false);
  });

  it("holds an alwaysApprove kind whatever the autonomy", () => {
    // The "drafts sensitive" half of the requirement. Without this a fully
    // autonomous agent has no way to write something and ask for it to be read.
    expect(canAutoExecute("autonomous", true, false, true)).toBe(false);
    expect(canAutoExecute("autonomous", false, false, true)).toBe(false);
    expect(canAutoExecute("act_in_app", false, false, true)).toBe(false);
  });

  it("defaults alwaysApprove to false, so existing three-arg calls are unchanged", () => {
    expect(canAutoExecute("autonomous", true, false)).toBe(true);
    expect(canAutoExecute("act_in_app", false, false)).toBe(true);
  });
});

describe("the composition that actually decides a post", () => {
  // schedule_social_post is outward: executing it commits a post to going
  // public unattended at a future time.
  const scheduleIsOutward = true;

  it("posts unattended for a client marked autonomous", () => {
    const level = resolveAutonomy("act_in_app", "autonomous");
    expect(canAutoExecute(level, scheduleIsOutward)).toBe(true);
  });

  it("waits for a person when the project says nothing", () => {
    const level = resolveAutonomy("act_in_app", null);
    expect(canAutoExecute(level, scheduleIsOutward)).toBe(false);
  });

  it("waits for a person on a held new client, even under an autonomous agent", () => {
    const level = resolveAutonomy("autonomous", "act_in_app");
    expect(canAutoExecute(level, scheduleIsOutward)).toBe(false);
  });

  it("still refuses to auto-delete for a trusted client", () => {
    // Destructive beats every grant there is.
    const level = resolveAutonomy("act_in_app", "autonomous");
    expect(canAutoExecute(level, false, true)).toBe(false);
  });
});
