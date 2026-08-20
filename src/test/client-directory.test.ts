// The directory exists because an agent asked for a client's company name when
// the answer was a row in the CRM. These cover what actually decides that: the
// data being present, and the instruction telling it not to ask.
import { describe, it, expect } from "vitest";
import {
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
