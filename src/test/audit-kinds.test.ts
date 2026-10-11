// The applicability map is the whole feature: showing a marketing client
// an "App store readiness" audit, or hiding the security audit from the
// web project that needs it most, both look completely normal on screen.
import { describe, it, expect } from "vitest";
import { AUDIT_KINDS, auditKind, kindsForProjectType } from "@/lib/auditKinds";

describe("the catalogue", () => {
  it("has unique keys", () => {
    const keys = AUDIT_KINDS.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every kind a label, a blurb and both colours", () => {
    for (const k of AUDIT_KINDS) {
      expect(k.label, k.key).toBeTruthy();
      expect(k.blurb, k.key).toBeTruthy();
      expect(k.bg, k.key).toMatch(/^#/);
      expect(k.fg, k.key).toMatch(/^#/);
    }
  });

  it("offers every project type something to run", () => {
    // A type with no audits reads as "we do not audit this", which is a
    // claim nobody made.
    for (const t of ["web_development", "app_development", "marketing", "automation_build", "site_preview"]) {
      expect(kindsForProjectType(t).length, t).toBeGreaterThan(0);
    }
  });
});

describe("kindsForProjectType", () => {
  it("narrows the catalogue to what fits the project", () => {
    const web = kindsForProjectType("web_development").map((k) => k.key);
    expect(web).toContain("security");
    expect(web).toContain("seo");
    // An app-store audit on a website is nonsense.
    expect(web).not.toContain("store");
    expect(web).not.toContain("social");
    expect(web.length).toBeLessThan(AUDIT_KINDS.length);
  });

  it("gives a marketing project the marketing ones and not the build ones", () => {
    const mkt = kindsForProjectType("marketing").map((k) => k.key);
    expect(mkt).toContain("seo");
    expect(mkt).toContain("email");
    expect(mkt).toContain("social");
    expect(mkt).not.toContain("store");
    expect(mkt).not.toContain("links");
  });

  it("gives an app project the app ones", () => {
    const app = kindsForProjectType("app_development").map((k) => k.key);
    expect(app).toContain("store");
    expect(app).toContain("security");
    expect(app).not.toContain("social");
  });

  it("offers everything for a project type it does not know", () => {
    // A new type should not silently have no audits available.
    for (const t of ["video_production", "", null, undefined]) {
      expect(kindsForProjectType(t).length, String(t)).toBe(AUDIT_KINDS.length);
    }
  });

  it("ignores case and surrounding space", () => {
    expect(kindsForProjectType("  Web_Development ").map((k) => k.key))
      .toEqual(kindsForProjectType("web_development").map((k) => k.key));
  });
});

describe("auditKind", () => {
  it("looks a known kind up", () => {
    expect(auditKind("security").label).toBe("Security audit");
  });

  it("keeps an uncatalogued kind's own words rather than hiding it", () => {
    // A row already in the database is a report the client paid for.
    const k = auditKind("core_web_vitals");
    expect(k.label).toBe("Core web vitals");
    expect(k.bg).toMatch(/^#/);
  });

  it("says Audit rather than nothing for a missing kind", () => {
    for (const v of ["", null, undefined, "   "]) {
      expect(auditKind(v).label, String(v)).toBe("Audit");
    }
  });
});
