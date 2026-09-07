// Which top-bar chip is lit.
//
// Clients opens an agent workspace view, so every /admin/agents URL is a
// candidate for both chips. Getting this wrong lights both or neither, and
// both failures look deliberate enough that nobody reports them.
import { describe, it, expect } from "vitest";
import { activeChip, NAV } from "@/lib/adminNav";

describe("activeChip", () => {
  it("lights Agents on the roster of agents and on a single agent", () => {
    expect(activeChip("/admin", "")).toBe("agents");
    expect(activeChip("/admin/agents/client-triage", "")).toBe("agents");
    expect(activeChip("/admin/agents/developer", "?view=queue")).toBe("agents");
  });

  it("lights Clients on the workspace clients view of ANY agent", () => {
    // Not just the client operations agent: the roster is in every agent's
    // rail, and the bar should say what you are looking at, not who you are
    // looking at it with.
    expect(activeChip("/admin/agents/client-triage", "?view=clients")).toBe("clients");
    expect(activeChip("/admin/agents/developer", "?view=clients")).toBe("clients");
  });

  it("lights Clients on the standalone roster, which mobile still uses", () => {
    expect(activeChip("/admin/clients", "")).toBe("clients");
    expect(activeChip("/admin/clients/abc-123", "")).toBe("clients");
  });

  it("never lights both", () => {
    const paths: Array<[string, string]> = [
      ["/admin", ""],
      ["/admin/agents/x", ""],
      ["/admin/agents/x", "?view=clients"],
      ["/admin/agents/x", "?view=tasks"],
      ["/admin/clients", ""],
      ["/admin/ventures", ""],
    ];
    for (const [p, q] of paths) {
      const r = activeChip(p, q);
      expect(r === "agents" || r === "clients" || r === null, `${p}${q}`).toBe(true);
    }
  });

  it("lights neither on a page that is in the menu instead", () => {
    expect(activeChip("/admin/ventures", "")).toBe(null);
    expect(activeChip("/admin/tokens", "")).toBe(null);
  });
});

describe("the menu", () => {
  it("no longer offers the coding queue, which moved into an agent's rail", () => {
    // A menu that still offers a thing you moved teaches people the old route.
    expect(NAV.map((n) => n.to)).not.toContain("/admin/queue");
  });
});
