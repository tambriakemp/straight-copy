/**
 * CRE-829: a proposal preview came up as an empty white sheet in a Chromium
 * browser.
 *
 * Measured in a real Chromium against a two-origin harness: a frame whose src
 * is a cross-origin PDF renders only when the response is both
 * `application/pdf` and inline. Give it `application/octet-stream`, or
 * `content-disposition: attachment`, and Chromium silently hands the response
 * to the download manager and leaves the frame blank. Both are reachable from
 * Supabase Storage, so the frame must never be pointed at the signed URL.
 *
 * These assert the two halves of that: the component turns the bytes into a
 * same-origin blob with the type forced, and neither proposal page has gone
 * back to putting a remote URL in an iframe src.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import PdfFrame from "@/components/PdfFrame";

const SIGNED_URL = "https://storage.example.com/object/sign/docs/proposal.pdf?token=abc";

let created: Blob[];
let revoked: string[];

beforeEach(() => {
  created = [];
  revoked = [];
  // jsdom has neither, and what the component does with them is the fix.
  // Added to the real URL rather than swapped for a stand-in: React flushes
  // the revoke during unmount, which happens after this file's own teardown.
  URL.createObjectURL = (b: Blob) => {
    created.push(b);
    return `blob:http://localhost/${created.length}`;
  };
  URL.revokeObjectURL = (u: string) => void revoked.push(u);
});

afterEach(() => {
  // Before the fetch stub goes, so an unmount still has one to find.
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function answerWith(type: string) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])], { type }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PdfFrame keeps the document off the frame's src", () => {
  it("reads the signed URL itself and frames a blob instead", async () => {
    const fetchMock = answerWith("application/pdf");
    render(<PdfFrame url={SIGNED_URL} title="Website build" />);

    const frame = await screen.findByTitle("Website build");
    expect(fetchMock).toHaveBeenCalledWith(SIGNED_URL);
    expect(frame.getAttribute("src")).toMatch(/^blob:/);
    // The one thing that must never be true again.
    expect(frame.getAttribute("src")).not.toContain("storage.example.com");
  });

  it("forces application/pdf when storage answers octet-stream", async () => {
    answerWith("application/octet-stream");
    render(<PdfFrame url={SIGNED_URL} title="Website build" />);

    await screen.findByTitle("Website build");
    // Without this the blob: URL downloads rather than renders, and the fix
    // would move the blank frame rather than remove it.
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe("application/pdf");
  });

  it("opens the viewer with the rail shut and the page fitted", async () => {
    answerWith("application/pdf");
    render(<PdfFrame url={SIGNED_URL} title="Website build" />);

    const src = (await screen.findByTitle("Website build")).getAttribute("src") ?? "";
    expect(src).toContain("navpanes=0");
    expect(src).toContain("toolbar=1");
    expect(src).toContain("zoom=page-width");
  });

  it("offers the signed URL as a way out when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, blob: async () => new Blob() })));
    render(<PdfFrame url={SIGNED_URL} title="Website build" />);

    // A signed URL that has expired is the likeliest reason to land here, and
    // a dead end would be worse than the blank frame this replaced.
    const out = await screen.findByText("Open it in a new tab");
    expect(out).toHaveAttribute("href", SIGNED_URL);
    expect(screen.queryByTitle("Website build")).not.toBeInTheDocument();
  });

  it("revokes the blob when the document is left", async () => {
    answerWith("application/pdf");
    const { unmount } = render(<PdfFrame url={SIGNED_URL} title="Website build" />);
    await screen.findByTitle("Website build");
    unmount();
    await waitFor(() => expect(revoked).toHaveLength(1));
  });
});

describe("neither proposal preview points a frame at storage", () => {
  it.each([
    ["the client's copy", "src/pages/PortalProposal.tsx"],
    ["the admin's copy", "src/pages/admin/ProposalDetail.tsx"],
    ["the agreements page", "src/pages/portal/ClientAgreements.tsx"],
  ])("%s", (_name, path) => {
    const source = readFileSync(path, "utf8");
    // `pdfUrl` and `sourceUrl` are the signed storage URLs on these pages.
    expect(source).not.toMatch(/<iframe[\s\S]{0,400}src=\{`?\$\{(pdfUrl|sourceUrl)\}/);
  });
});
