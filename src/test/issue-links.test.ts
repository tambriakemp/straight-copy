import { describe, it, expect } from "vitest";
import { classifyRefChips, containsKnownIssueId, issueUrl, linkifySegments } from "../lib/issueLinks";

describe("issueLinks", () => {
  it("links a bare known-prefix id", () => {
    expect(linkifySegments("See CRE-335 for details")).toEqual([
      { text: "See " },
      { text: "CRE-335", prefix: "CRE", num: "335" },
      { text: " for details" },
    ]);
  });

  it("links both ends of an en-dash range", () => {
    const segs = linkifySegments("CRE-269–285 Phase 2");
    expect(segs[0]).toEqual({ text: "CRE-269", prefix: "CRE", num: "269" });
    expect(segs[1]).toEqual({ text: "–" });
    expect(segs[2]).toEqual({ text: "285", prefix: "CRE", num: "285" });
  });

  it("does not extend a plain ASCII hyphen into a range", () => {
    const segs = linkifySegments("CRE-100-ish");
    expect(segs.filter((s) => s.prefix)).toEqual([{ text: "CRE-100", prefix: "CRE", num: "100" }]);
    expect(segs.some((s) => s.text === "-ish")).toBe(true);
  });

  it("never matches a lowercase prefix", () => {
    expect(linkifySegments("pre-2020 launch").every((s) => !s.prefix)).toBe(true);
  });

  it("leaves unknown prefixes as plain text", () => {
    expect(linkifySegments("MEN-12 is not tracked yet").every((s) => !s.prefix)).toBe(true);
  });

  it("builds the Paperclip card URL", () => {
    expect(issueUrl("CRE", 335)).toBe("https://paperclip.cre8visions.com/CRE/issues/CRE-335");
  });

  it("reports whether text contains a linkable id", () => {
    expect(containsKnownIssueId("Nothing here")).toBe(false);
    expect(containsKnownIssueId("CRE-1 here")).toBe(true);
  });

  it("classifies a compact ref array, carrying the prefix across bare numbers", () => {
    expect(classifyRefChips(["CRE-325", "326", "327"])).toEqual([
      { raw: "CRE-325", prefix: "CRE", num: "325" },
      { raw: "326", prefix: "CRE", num: "326" },
      { raw: "327", prefix: "CRE", num: "327" },
    ]);
  });

  it("leaves a non-numeric overflow marker unlinked", () => {
    expect(classifyRefChips(["CRE-328", "+4"])).toEqual([
      { raw: "CRE-328", prefix: "CRE", num: "328" },
      { raw: "+4", prefix: null, num: null },
    ]);
  });

  it("doesn't carry a prefix across an unknown-prefix id", () => {
    expect(classifyRefChips(["MEN-12", "13"])).toEqual([
      { raw: "MEN-12", prefix: null, num: null },
      { raw: "13", prefix: null, num: null },
    ]);
  });
});
