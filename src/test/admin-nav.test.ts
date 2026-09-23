// Which top-bar chip is lit.
//
// Clients opens an agent workspace view, so every /admin/agents URL is a
// candidate for both chips. Getting this wrong lights both or neither, and
// both failures look deliberate enough that nobody reports them.
import { describe, it, expect } from "vitest";
import { NAV } from "@/lib/adminNav";

describe("the menu", () => {
  it("no longer offers the coding queue, which moved into an agent's rail", () => {
    // A menu that still offers a thing you moved teaches people the old route.
    expect(NAV.map((n) => n.to)).not.toContain("/admin/queue");
  });

  it("keeps secondary admin tools in the profile menu", () => {
    expect(NAV.map((n) => n.label)).toEqual([
      "Agents", "Tasks / Queue", "Wiki", "Tokens", "Invites", "Ventures", "Portfolio", "Profile",
    ]);
  });
});
