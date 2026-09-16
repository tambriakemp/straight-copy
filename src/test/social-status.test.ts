// The wording and filtering behind the social tab's status strip.
//
// Worth pinning because both are quietly load-bearing: the autonomy pill is the
// only place the tab says whether posts go out unread, and the filter decides
// what "needs review" means for a batch that is still being written.
import { describe, it, expect } from "vitest";
import {
  autonomyPill, postsUnattended, matchesFilter, BATCH_FILTERS,
} from "@/components/admin/social/socialStatus";

describe("autonomyPill", () => {
  it("says what will actually happen to this client's posts", () => {
    expect(autonomyPill("act_in_app", "Iris")).toBe("Iris holds for your review");
    expect(autonomyPill("autonomous", "Iris")).toBe("Iris posts unattended");
    expect(autonomyPill("propose", "Iris")).toBe("Iris is paused");
  });

  it("treats an unset level the same as inherit", () => {
    // agent_autonomy is null until someone chooses, and null is not a fourth
    // meaning — it is the absence of an override.
    expect(autonomyPill(null, "Iris")).toBe(autonomyPill("inherit", "Iris"));
  });

  it("never writes an agent name of its own", () => {
    // Four of the six agents have been renamed. A hardcoded name here would
    // keep rendering perfectly while telling the reader something false.
    for (const level of ["act_in_app", "autonomous", "propose", "inherit", null] as const) {
      expect(autonomyPill(level, "Nyla")).toContain("Nyla");
      expect(autonomyPill(level, "Nyla")).not.toMatch(/iris/i);
    }
  });
});

describe("postsUnattended", () => {
  it("is true only for the level that skips review", () => {
    expect(postsUnattended("autonomous")).toBe(true);
    for (const level of ["act_in_app", "propose", "inherit", null] as const) {
      expect(postsUnattended(level), String(level)).toBe(false);
    }
  });
});

describe("matchesFilter", () => {
  it("counts a batch still generating as needing review", () => {
    // It will need reviewing the moment it finishes. Filing it under "all"
    // only means flipping back to find it.
    expect(matchesFilter("drafting", "needs_review")).toBe(true);
    expect(matchesFilter("ready_for_review", "needs_review")).toBe(true);
    expect(matchesFilter("published", "needs_review")).toBe(false);
  });

  it("separates sent from errored", () => {
    expect(matchesFilter("published", "sent")).toBe(true);
    expect(matchesFilter("publishing", "sent")).toBe(true);
    expect(matchesFilter("error", "sent")).toBe(false);
    expect(matchesFilter("error", "errors")).toBe(true);
  });

  it("lets everything through on All, including a status we do not know", () => {
    for (const s of ["drafting", "published", "error", "something_new"]) {
      expect(matchesFilter(s, "all"), s).toBe(true);
    }
  });

  it("offers every filter the UI renders", () => {
    expect(BATCH_FILTERS.map((f) => f.key)).toEqual(["all", "needs_review", "sent", "errors"]);
  });
});
