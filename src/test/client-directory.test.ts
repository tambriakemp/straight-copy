// The directory exists because an agent asked for a client's company name when
// the answer was a row in the CRM. These cover what actually decides that: the
// data being present, and the instruction telling it not to ask.
import { describe, it, expect } from "vitest";
import {
  renderClientIndex,
  renderDirectory,
  type DirectoryClient,
} from "../../supabase/functions/_shared/agents/clients";

const menovia: DirectoryClient = {
  id: "c1",
  company: "Menovia AI",
  contact_name: "Dr. Khadra Kahin",
  contact_email: "kkahin@mihealths.com",
  contact_phone: null,
  pipeline_stage: "active",
  tier: "premium",
  in_surecontact: true,
  projects: [
    { id: "p1", name: "Menovia Social Media", type: "marketing", status: "active" },
    { id: "p2", name: "Aviya Telemed", type: "app_development", status: "active" },
  ],
};

describe("renderDirectory", () => {
  it("produces nothing when there are no clients", () => {
    // An empty roster with a heading reads as "you have no clients", which is a
    // claim the agent should never be handed.
    expect(renderDirectory([])).toBe("");
  });

  it("carries the fields agents kept asking for", () => {
    const out = renderDirectory([menovia]);
    expect(out).toContain("Menovia AI");
    expect(out).toContain("Dr. Khadra Kahin");
    expect(out).toContain("kkahin@mihealths.com");
    // The project and its type are what decide where a proposal is attached.
    expect(out).toContain("Menovia Social Media");
    expect(out).toContain("marketing");
  });

  it("says the company name is the business name and the signer is the contact", () => {
    const out = renderDirectory([menovia]).replace(/\s+/g, " ");
    expect(out).toContain("Do not ask for anything this list already contains");
    expect(out.toLowerCase()).toContain("the signer is the named contact");
  });

  it("tells the agent to disambiguate rather than guess", () => {
    const out = renderDirectory([menovia, { ...menovia, id: "c2" }])
      .replace(/\s+/g, " ");
    expect(out.toLowerCase()).toContain("more than one client");
  });

  it("emits valid JSON the model can read back", () => {
    const out = renderDirectory([menovia]);
    const json = out.slice(out.indexOf("["));
    const parsed = JSON.parse(json) as DirectoryClient[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0].projects).toHaveLength(2);
  });
});

describe("renderClientIndex", () => {
  it("is an index, not a dump — no email, no phone, no nested projects", () => {
    // The full directory was 40-80KB after the only cache breakpoint, re-billed
    // every turn for every agent. The index carries what resolves a name.
    const out = renderClientIndex([menovia]);
    expect(out).toContain("Menovia AI");
    expect(out).toContain("c1");
    expect(out).not.toContain("kkahin@mihealths.com");
    expect(out).not.toContain("Menovia Social Media");
  });

  it("is dramatically smaller than the full directory", () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ ...menovia, id: `c${i}` }));
    expect(renderClientIndex(many).length).toBeLessThan(
      renderDirectory(many).length / 5,
    );
  });

  it("still says to look things up rather than ask", () => {
    const out = renderClientIndex([menovia]).replace(/\s+/g, " ");
    expect(out).toContain("Do not ask the owner for a detail you can fetch");
    expect(out.toLowerCase()).toContain("more than one row");
  });

  it("produces nothing for an empty roster", () => {
    expect(renderClientIndex([])).toBe("");
  });

  it("names a client with no company by their contact", () => {
    const out = renderClientIndex([{ ...menovia, company: null }]);
    expect(out).toContain("Dr. Khadra Kahin");
  });
});
