import { describe, it, expect } from "vitest";
import { projectTagStyle } from "../lib/projectTags";

describe("projectTagStyle", () => {
  it("matches a known project case-insensitively and normalizes its label", () => {
    expect(projectTagStyle("menovia")).toEqual({ label: "Menovia", bg: "#f3effe", fg: "#6d28d9", border: "#e6dcfd" });
    expect(projectTagStyle("MENOVIA")).toEqual(projectTagStyle("Menovia"));
  });

  it("keeps cre8visions.com lowercase, matching the domain", () => {
    expect(projectTagStyle("cre8visions.com").label).toBe("cre8visions.com");
  });

  it("falls back to a neutral tag with the project's own text for an unknown project", () => {
    expect(projectTagStyle("Some New Client")).toEqual({ label: "Some New Client", bg: "#f3f4f6", fg: "#4b5563", border: "#e5e7eb" });
  });
});
