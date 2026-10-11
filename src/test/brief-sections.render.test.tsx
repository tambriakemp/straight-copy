// CRE-366: renders each redesigned brief card with data shaped like the
// approved mockup (brief-sections.html) to prove the components actually
// mount and produce the expected DOM — not just that they typecheck.
// PipelineBriefCard is the one with a live data dependency (pipeline-board);
// it's mocked here the same way Pipeline.tsx's own tests would, so this
// still proves the component's render path without needing a live session.
//
// CRE-391: DoneTimelineCard, ApprovalsCard and InFlightCard are retired —
// Done is dropped from the Today page outright, and approvals/in-flight now
// render as plain NeedsYouRow entries in the merged list (see
// needs-you-rows.test.ts for that conversion's coverage). Money and
// Pipeline are the only dedicated cards left.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import MoneyCard from "../components/admin/cv/MoneyCard";
import PipelineBriefCard from "../components/admin/cv/PipelineBriefCard";
import type { MoneyStats, BriefPipeline } from "../lib/briefs";
import type { PipelineBoard } from "../lib/pipelineBoard";

vi.mock("../lib/pipelineBoard", async () => {
  const actual = await vi.importActual<typeof import("../lib/pipelineBoard")>("../lib/pipelineBoard");
  return { ...actual, loadPipelineBoard: vi.fn() };
});
import { loadPipelineBoard } from "../lib/pipelineBoard";

const noop = { isDone: () => false, complete: async () => true, undo: async () => true };

describe("brief sections (CRE-366)", () => {
  it("MoneyCard renders stat cards, trend and the overnight footnote, no checkbox", () => {
    const stats: MoneyStats = {
      range_label: "Mon Oct 5 – Sun Oct 11",
      source_label: "Stripe + SureCart email confirmations",
      cards: [
        { id: "deposits_week", label: "Deposits this week", display: "$2,500", trend: "up", trend_label: "vs last week", lines: ["Dr. Kahin · Menovia Phase 2 deposit", "Oct 7, ~8:08 PM · SureCart #0090"] },
        { id: "unpaid_invoices", label: "Unpaid invoices", display: "$0 open", trend: "flat" },
      ],
      note: "No other payments found overnight.",
    };
    render(<MoneyCard stats={stats} />);
    expect(screen.getByText("$2,500")).toBeInTheDocument();
    expect(screen.getByText("$0 open")).toBeInTheDocument();
    expect(screen.getByText("vs last week")).toBeInTheDocument();
    expect(screen.getByText(/No other payments found overnight/)).toBeInTheDocument();
    expect(document.querySelector(".cv-money button")).toBeNull(); // no checkboxes anywhere in Money
  });

  it("MoneyCard renders nothing when there are no cards", () => {
    const { container } = render(<MoneyCard stats={{ cards: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("PipelineBriefCard renders live stage pills folding proposalSent+signed into one Proposal pill", async () => {
    const board: PipelineBoard = {
      pipelineUuid: "p1", syncedAt: new Date().toISOString(), unmatchedCount: 0,
      lost: { count: 0, totalCents: 0, deals: [] },
      columns: [
        { key: "lead", label: "Lead", count: 8, totalCents: 2_400_000, deals: [] },
        { key: "intake", label: "Intake", count: 3, totalCents: 900_000, deals: [] },
        { key: "proposalSent", label: "Proposal sent", count: 1, totalCents: 500_000, deals: [] },
        { key: "signed", label: "Signed", count: 1, totalCents: 250_000, deals: [] },
        { key: "won", label: "Won", count: 1, totalCents: 500_000, deals: [] },
      ],
    };
    vi.mocked(loadPipelineBoard).mockResolvedValue(board);

    const pipeline: BriefPipeline = {
      outreach_round: { date: "2026-10-12", pending: 35, cutoff: new Date(Date.now() + 4 * 86_400_000).toISOString(), note: "Still pending at the cutoff counts as a no." },
      hot_leads: [{ id: "lead-kahin", name: "Dr. Kahin · Menovia", status: "Telehealth proposal sent for her review.", stage: "Proposal sent", task_id: "CRE-267" }],
    };
    render(<PipelineBriefCard pipeline={pipeline} {...noop} briefDate="2026-10-08" />);

    expect(await screen.findByText("8")).toBeInTheDocument(); // Lead count
    expect(screen.getByText("2")).toBeInTheDocument(); // Proposal count = 1 (sent) + 1 (signed)
    expect(screen.getByText("$7,500.00")).toBeInTheDocument(); // Proposal total = 500000+250000 cents
    expect(screen.getByText("35")).toBeInTheDocument(); // outreach round pending
    expect(screen.getByText("Dr. Kahin · Menovia")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CRE-267" })).toHaveAttribute("href", "https://paperclip.cre8visions.com/CRE/issues/CRE-267");
  });
});
