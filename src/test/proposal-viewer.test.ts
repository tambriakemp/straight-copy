import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync("src/components/admin/agent/AgentProposalPanel.tsx", "utf8");
const workspace = readFileSync("src/pages/admin/AgentWorkspace.tsx", "utf8");
const chat = readFileSync("src/components/admin/agent/AgentChatPanel.tsx", "utf8");

// Bree: "she will be doing all revising. this needs to work no different than
// how i communicate with you and ask you to do things."
describe("the proposal panel is a viewer, not an editor", () => {
  it.each([
    ["<input", "an input"],
    ["<textarea", "a textarea"],
    ["contentEditable", "a contenteditable region"],
    ["<Textarea", "a shadcn Textarea"],
    ["<Input", "a shadcn Input"],
  ])("has no %s", (needle) => {
    expect(panel).not.toContain(needle);
  });

  it("offers nothing that saves an edit", () => {
    expect(panel.toLowerCase()).not.toContain("onsave");
    expect(panel).not.toMatch(/from\(["']client_proposals["']\)[\s\S]{0,80}\.update\(/);
  });
});

// The rule the whole architecture rests on. If the document is pasted into
// chat: ~6,000 tokens re-enter context every turn, the thread becomes
// unreadable, and there is no single source of truth.
describe("the document does not live in the conversation", () => {
  it("the chat panel never renders proposal content", () => {
    expect(chat).not.toContain("renderProposalHtml");
    expect(chat).not.toContain("client_proposals");
  });

  it("the panel renders from the stored row, through the shared renderer", () => {
    expect(panel).toContain("renderProposalHtml");
    expect(panel).toContain("proposal.content");
  });
});

describe("the workspace", () => {
  it("puts the document beside the chat rather than replacing it", () => {
    expect(workspace).toContain("AgentChatPanel");
    expect(workspace).toContain("AgentProposalPanel");
  });

  it("keeps activity reachable rather than displacing it", () => {
    expect(workspace).toContain("AgentActivityPanel");
    expect(workspace).toContain('setAside("activity")');
  });

  it("surfaces the document once sections start landing", () => {
    expect(workspace).toContain('setAside("document")');
  });
});

describe("the panel handles the states that actually happen", () => {
  it("says so when nothing is in focus", () => {
    expect(panel).toContain("No proposal in focus");
  });

  it("renders a part-written draft rather than erroring", () => {
    expect(panel).toContain("nothing written yet");
  });

  it("reports outstanding gaps without preventing anything", () => {
    expect(panel).toContain("Still to cover");
    expect(panel).toContain("reviewProposal");
  });

  it("does not offer a PDF that has not been rendered", () => {
    expect(panel).toContain("source_pdf_path");
    expect(panel).toContain("no PDF yet");
  });
});
