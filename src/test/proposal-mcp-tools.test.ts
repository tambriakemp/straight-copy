import { describe, expect, it } from "vitest";
import {
  editBlockedReason,
  MCP_PROPOSAL_ACTOR,
  proposalListItem,
  type ProposalListRow,
} from "../../supabase/functions/_shared/agents/proposal-mcp";

const row = (over: Partial<ProposalListRow> = {}): ProposalListRow => ({
  id: "p-1",
  title: "Menovia — App Growth & Install Engine",
  status: "draft",
  content: {
    kind: "marketing retainer",
    sections: [
      { heading: "The Opportunity", body: "The app is live. Now she has to find it." },
      { heading: "Acceptance", body: "Signing accepts the scope above." },
      // Placeholder with nothing written — must not count as a section.
      { heading: "Terms", body: "   " },
    ],
  },
  content_version: 3,
  sent_at: null,
  client_id: "c-1",
  client_project_id: "cp-1",
  created_at: "2026-09-21T00:00:00Z",
  updated_at: "2026-09-22T00:00:00Z",
  ...over,
});

describe("the MCP's draft-only gate", () => {
  it("lets a draft through", () => {
    expect(editBlockedReason("draft")).toBeNull();
  });

  it("refuses every status past draft", () => {
    for (const status of ["sent", "signed", "declined", "voided"]) {
      expect(editBlockedReason(status), status).toBeTruthy();
    }
  });

  it("names the status it refused, so the caller knows what happened", () => {
    expect(editBlockedReason("sent")).toContain("'sent'");
    expect(editBlockedReason("signed")).toMatch(/signed/i);
  });
});

describe("list_proposals rows", () => {
  it("counts only sections with something written, and drops the content", () => {
    const item = proposalListItem(row());
    expect(item.sections_written).toBe(2);
    expect(item).not.toHaveProperty("content");
    expect(item).toMatchObject({
      id: "p-1",
      status: "draft",
      version: 3,
      sent_at: null,
      client_project_id: "cp-1",
    });
  });

  it("survives a proposal with no structured content at all", () => {
    // Pre-agent proposals were uploaded PDFs: content is null.
    const item = proposalListItem(row({ content: null, content_version: null }));
    expect(item.sections_written).toBe(0);
    expect(item.version).toBeNull();
  });
});

describe("the writer's identity", () => {
  it("is a stable actor string for proposal_events", () => {
    expect(MCP_PROPOSAL_ACTOR).toBe("agency-mcp");
  });
});
