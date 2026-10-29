/**
 * CRE-825: the document reads in the page instead of behind a click, and
 * closed-out versions start collapsed.
 *
 * Both halves of the card are checked against the component rather than a
 * pure function, because both live in JSX: which statuses the picker shows
 * by default, and whether the source PDF is fetched and drawn inline.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import type { AgreementsView, AgreementView } from "@/lib/clientPortalWire";

const view = vi.hoisted(() => ({ current: null as AgreementsView | null }));
const openForPreview = vi.hoisted(() => vi.fn());

vi.mock("@/components/portal/useClientPortal", () => ({
  useAdminPreview: () => ({
    adminPreview: false,
    viewAsGrant: false,
    actor: "",
    exitPreview: () => {},
  }),
  usePortalView: () => ({
    data: view.current,
    loading: false,
    error: null,
    reload: () => {},
  }),
}));

vi.mock("@/lib/clientPortalApi", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/clientPortalApi")>("@/lib/clientPortalApi");
  return {
    ...actual,
    clientPortal: {
      ...actual.clientPortal,
      openForPreview,
    },
  };
});

const { default: ClientAgreements } = await import("@/pages/portal/ClientAgreements");

function agreement(over: Partial<AgreementView> = {}): AgreementView {
  return {
    id: "ag-1",
    number: "CV-2026-001",
    title: "Website build",
    preparedFor: "Glowskin Studio",
    preparedBy: "Northhill Studio",
    sentAt: "2026-09-01T00:00:00.000Z",
    status: "sent",
    scopeHeading: "What we'll build",
    scopeBody: "A website.",
    lineItems: [],
    totalCents: 100_000,
    currency: "USD",
    instalmentSummary: null,
    hasSourcePdf: false,
    hasSignedDocument: false,
    signedAt: null,
    signerName: null,
    ...over,
  };
}

function agreementsView(agreements: AgreementView[]): AgreementsView {
  return {
    branding: {
      agencyName: "Northhill Studio",
      monogram: "NS",
      contactName: null,
      replyWindow: null,
      contactEmail: null,
    },
    me: { clientId: "client-7", displayName: "Maya", businessName: null, initials: "M" },
    agreements,
    signing: {
      consentText: "I agree.",
      styles: [{ key: "script", name: "Script", fontStack: "cursive" }],
      defaultStyle: "script",
      hosted: false,
      depositProviderName: null,
      depositCents: null,
    },
  };
}

function renderAgreements(value: AgreementsView, initialEntry = "/portal/client-7/agreements") {
  view.current = value;
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ClientAgreements />
    </MemoryRouter>,
  );
}

describe("which versions the picker shows by default", () => {
  it("hides superseded/voided and expired versions, and keeps everything else", () => {
    const open = agreement({ id: "ag-open", status: "sent", title: "Open one" });
    const signed = agreement({ id: "ag-signed", status: "signed", title: "Signed one" });
    const declined = agreement({ id: "ag-declined", status: "declined", title: "Declined one" });
    const voided = agreement({ id: "ag-void", status: "void", title: "Superseded one" });
    const expired = agreement({ id: "ag-expired", status: "expired", title: "Expired one" });

    const { container } = renderAgreements(
      agreementsView([open, signed, declined, voided, expired]),
    );
    const picker = within(container.querySelector(".cp-picker") as HTMLElement);

    expect(picker.getByText("Open one")).toBeInTheDocument();
    expect(picker.getByText("Signed one")).toBeInTheDocument();
    expect(picker.getByText("Declined one")).toBeInTheDocument();
    expect(picker.queryByText("Superseded one")).toBeNull();
    expect(picker.queryByText("Expired one")).toBeNull();

    expect(screen.getByText("Show previous versions (2)")).toBeInTheDocument();
  });

  it("reveals the closed-out versions once the toggle is clicked, and can hide them again", () => {
    const open = agreement({ id: "ag-open", status: "sent", title: "Open one" });
    const voided = agreement({ id: "ag-void", status: "void", title: "Superseded one" });

    renderAgreements(agreementsView([open, voided]));

    fireEvent.click(screen.getByText("Show previous versions (1)"));
    expect(screen.getByText("Superseded one")).toBeInTheDocument();
    expect(screen.getByText("Hide previous versions")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Hide previous versions"));
    expect(screen.queryByText("Superseded one")).toBeNull();
  });

  it("draws no toggle at all when nothing is closed out", () => {
    renderAgreements(
      agreementsView([
        agreement({ id: "ag-open", status: "sent" }),
        agreement({ id: "ag-signed", status: "signed" }),
      ]),
    );
    expect(screen.queryByText(/Show previous versions/)).toBeNull();
  });

  it("a link straight to a closed-out version lands on it, expanded, rather than silently swapping to the newest open one", () => {
    const open = agreement({ id: "ag-open", status: "sent", title: "Open one" });
    const voided = agreement({ id: "ag-void", status: "void", title: "Superseded one" });

    const { container } = renderAgreements(
      agreementsView([open, voided]),
      "/portal/client-7/agreements?id=ag-void",
    );

    // The document pane draws the requested (closed) agreement...
    expect(container.querySelector(".cp-doc__title")?.textContent).toBe("Superseded one");
    // ...and the picker shows it rather than collapsing it out from under
    // the client who was just sent this exact link.
    expect(screen.getByText("Hide previous versions")).toBeInTheDocument();
    expect(
      within(container.querySelector(".cp-picker") as HTMLElement).getByText("Superseded one"),
    ).toBeInTheDocument();
  });
});

describe("the source PDF", () => {
  it("is fetched on mount and drawn inline, not behind a click", async () => {
    openForPreview.mockReset();
    openForPreview.mockResolvedValue({
      url: "blob:mock-pdf",
      filename: "proposal.pdf",
      revoke: vi.fn(),
    });

    renderAgreements(
      agreementsView([agreement({ id: "ag-pdf", status: "sent", hasSourcePdf: true })]),
    );

    const frame = await waitFor(() => screen.getByTitle(/proposal document/i));
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("src", "blob:mock-pdf");
    // No click needed to get here -- the fetch started on mount.
    // `clientId` is "" rather than "client-7" because this render has no
    // <Route> to parse it from, matching the rest of this file's helper.
    expect(openForPreview).toHaveBeenCalledWith("", "ag-pdf", "source", false);
  });

  it("says so, rather than drawing a blank frame, when the fetch fails", async () => {
    openForPreview.mockReset();
    openForPreview.mockRejectedValue(new Error("network down"));

    renderAgreements(
      agreementsView([agreement({ id: "ag-pdf", status: "sent", hasSourcePdf: true })]),
    );

    expect(await screen.findByText("That document could not be opened.")).toBeInTheDocument();
    expect(screen.queryByTitle(/proposal document/i)).toBeNull();
  });

  it("revokes the blob URL when the client switches to another agreement", async () => {
    const revoke = vi.fn();
    openForPreview.mockReset();
    openForPreview.mockResolvedValue({ url: "blob:mock-pdf", filename: "a.pdf", revoke });

    const { container } = renderAgreements(
      agreementsView([
        agreement({ id: "ag-pdf", status: "sent", hasSourcePdf: true, title: "With PDF" }),
        agreement({ id: "ag-plain", status: "signed", hasSourcePdf: false, title: "No PDF" }),
      ]),
    );
    await waitFor(() => screen.getByTitle(/proposal document/i));

    // Picking the other agreement within the same mounted router -- not a
    // fresh navigation -- is what actually unmounts the preview and runs
    // its cleanup, the same as a client clicking to a different agreement.
    fireEvent.click(
      within(container.querySelector(".cp-picker") as HTMLElement).getByText("No PDF"),
    );

    await waitFor(() => expect(revoke).toHaveBeenCalled());
  });
});
