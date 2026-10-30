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

// CRE-868 (design-gate review of CRE-832): the PDF is the artifact a client
// actually reads and signs, and it had drifted from both the HTML renderer
// and PROPOSAL_BRIEFING in two places. These are readFileSync assertions for
// the same reason as above — proposal-pdf.ts carries `npm:` specifiers a
// frontend test cannot import.
const pdfSource = readFileSync("supabase/functions/_shared/proposal-pdf.ts", "utf8");

describe("the PDF cover draws cover.price_line like the HTML's .price-line", () => {
  it("draws price_line between the tagline and the cover rule", () => {
    const taglineIdx = pdfSource.indexOf("cover.tagline");
    const priceIdx = pdfSource.indexOf("cover.price_line");
    const ruleIdx = pdfSource.indexOf("c.rule();"); // first occurrence is the cover's
    expect(taglineIdx).toBeGreaterThan(-1);
    expect(priceIdx).toBeGreaterThan(taglineIdx);
    expect(ruleIdx).toBeGreaterThan(priceIdx);
  });

  it("styles it bronze, bold and uppercase, matching the HTML treatment", () => {
    const start = pdfSource.indexOf("cover.price_line");
    const snippet = pdfSource.slice(start, start + 600);
    expect(snippet).toContain("fonts.bodyBold");
    expect(snippet).toContain("BRONZE");
    expect(snippet).toMatch(/\.toUpperCase\(\)/);
  });
});

describe("drawBody treats a whole-bold short line as a subhead, same as ## ", () => {
  it("imports the shared predicate from proposal-spine rather than its own regex copy", () => {
    expect(pdfSource).toMatch(/import\s*{[^}]*isBoldSubheadLine[^}]*}\s*from\s*"\.\/agents\/proposal-spine\.ts"/);
  });

  it("calls it inside drawBody, so '**BOLD**' and '## ' take the same path", () => {
    const drawBodyIdx = pdfSource.indexOf("function drawBody");
    const nextFnIdx = pdfSource.indexOf("export async function renderProposalPdf");
    const drawBodySource = pdfSource.slice(drawBodyIdx, nextFnIdx);
    expect(drawBodySource).toContain("isBoldSubheadLine(line)");
  });
});
