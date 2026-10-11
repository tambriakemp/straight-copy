// Two small lookups whose fallbacks are the whole point: a project type
// added to the database before it is added here, and a client name that is
// not "Firstname Lastname". Both used to produce something blank or
// something wrong, and neither looks broken on screen.
import { describe, it, expect } from "vitest";
import { projectTypeStyle } from "@/lib/projectType";
import { avatarFor } from "@/lib/avatar";

describe("projectTypeStyle", () => {
  it("writes the known types out in full", () => {
    // Not "App" on one page and "App Development" on another — the label
    // lived in four files with three spellings before this.
    expect(projectTypeStyle("app_development").label).toBe("App development");
    expect(projectTypeStyle("web_development").label).toBe("Web development");
    expect(projectTypeStyle("marketing").label).toBe("Marketing");
    expect(projectTypeStyle("automation_build").label).toBe("Automation");
    expect(projectTypeStyle("site_preview").label).toBe("Preview");
  });

  it("keeps an unknown type's own words instead of swallowing it", () => {
    // Types reach the database before they reach this file, and "Unknown
    // project type" told you nothing you could act on.
    expect(projectTypeStyle("video_production").label).toBe("Video production");
    expect(projectTypeStyle("brand-refresh").label).toBe("Brand refresh");
  });

  it("says Project rather than nothing for a missing type", () => {
    for (const t of [null, undefined, "", "   "]) {
      expect(projectTypeStyle(t).label, String(t)).toBe("Project");
    }
  });

  it("gives every type a fill, a text colour and a dot", () => {
    for (const t of ["app_development", "something_new", null]) {
      const s = projectTypeStyle(t);
      expect(s.bg, String(t)).toMatch(/^#/);
      expect(s.fg, String(t)).toMatch(/^#/);
      expect(s.dot, String(t)).toMatch(/^#/);
    }
  });
});

describe("avatarFor", () => {
  it("takes the first two letters, the way the canvas draws them", () => {
    // Not one initial per word: "SR" for Sims Resource Group and "MT" for
    // Magna Tax Relief are acronyms you have to decode, and the square
    // sits right beside the full name.
    expect(avatarFor("Menovia").initials).toBe("Me");
    expect(avatarFor("Sims Resource Group").initials).toBe("Si");
    expect(avatarFor("Magna Tax Relief").initials).toBe("Ma");
  });

  it("drops a leading title, which is not who anyone is", () => {
    // Otherwise every Dr. Somebody squares up as the same "Dr".
    expect(avatarFor("Dr. Khadra Kahin").initials).toBe("Kh");
    expect(avatarFor("Ms Mary Sims").initials).toBe("Ma");
  });

  it("reads across a comma or a middot as if it were a space", () => {
    expect(avatarFor("Cre8 Visions, LLC").initials).toBe("Cr");
    expect(avatarFor("· Menovia").initials).toBe("Me");
  });

  it("keeps a digit that is part of the name", () => {
    expect(avatarFor("3M").initials).toBe("3m");
  });

  it("says ? rather than drawing an empty square", () => {
    for (const n of ["", "   ", "...", "·", "Dr."]) {
      expect(avatarFor(n).initials, JSON.stringify(n)).toBe("?");
    }
  });

  it("gives one name the same colour every time", () => {
    // Keyed off a hash rather than a list index, so re-sorting the roster
    // does not reshuffle everyone's colour.
    expect(avatarFor("Menovia").bg).toBe(avatarFor("Menovia").bg);
    expect(avatarFor("Menovia").bg).not.toBe(avatarFor("Menovia", true).bg);
  });

  it("marks our own books with the ink square", () => {
    const internal = avatarFor("Cre8 Visions, LLC", true);
    expect(internal.bg).toBe("#0E1116");
    expect(internal.fg).toBe("#FFFFFF");
  });
});
