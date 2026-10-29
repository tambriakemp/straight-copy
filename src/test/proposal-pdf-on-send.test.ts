import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// CRE-832: a builder-written proposal has content but no source_pdf_path
// until something renders it. There are two paths that can mark a proposal
// "sent" — the admin's own notify/resend action, and the agent's own
// send_proposal tool action — and both must render-and-store the PDF first
// when needsPdfRender says the document is missing or stale. If either path
// drops this check, the client ends up asked to read or sign nothing, which
// is exactly the bug this card fixed. These are readFileSync assertions
// rather than a live call because the Deno edge functions here reach
// `npm:` specifiers that a frontend test cannot import (see CLAUDE.md).
const notifyAction = readFileSync("supabase/functions/proposal-sign/index.ts", "utf8");
const sendProposalAction = readFileSync("supabase/functions/_shared/agents/actions.ts", "utf8");

describe("every path that can mark a proposal sent renders its PDF first", () => {
  it("admin's notify action checks needsPdfRender before sending", () => {
    expect(notifyAction).toContain("needsPdfRender(row)");
    expect(notifyAction).toContain("renderAndStoreProposalPdf(");
  });

  it("the agent's send_proposal action checks needsPdfRender before sending", () => {
    expect(sendProposalAction).toContain("needsPdfRender(proposal)");
    expect(sendProposalAction).toContain("renderAndStoreProposalPdf(");
  });

  it("both share the one render-and-store implementation, not a local copy", () => {
    expect(notifyAction).toContain('from "../_shared/proposal-pdf.ts"');
    expect(sendProposalAction).toContain('from "../proposal-pdf.ts"');
    // The old per-file copy is gone — there is exactly one place this is
    // written, so the sha256 it now records can't drift between callers.
    expect(sendProposalAction).not.toContain("async function renderAndStoreProposalPdf(");
  });
});
