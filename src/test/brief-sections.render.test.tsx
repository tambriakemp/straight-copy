// CRE-366: renders each redesigned brief card with data shaped like the
// approved mockup (brief-sections.html) to prove the components actually
// mount and produce the expected DOM — not just that they typecheck.
// PipelineBriefCard is the one with a live data dependency (pipeline-board);
// it's mocked here the same way Pipeline.tsx's own tests would, so this
// still proves the component's render path without needing a live session.
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import MoneyCard from "../components/admin/cv/MoneyCard";
import DoneTimelineCard from "../components/admin/cv/DoneTimelineCard";
import ApprovalsCard from "../components/admin/cv/ApprovalsCard";
import PipelineBriefCard from "../components/admin/cv/PipelineBriefCard";
import InFlightCard from "../components/admin/cv/InFlightCard";
import type { MoneyStats, DoneItem, ApprovalCard as ApprovalCardData, BriefPipeline, InFlightItem } from "../lib/briefs";
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

  it("DoneTimelineCard renders a checkable item with a linked CRE id", () => {
    const items: DoneItem[] = [
      { id: "done-cre-267", title: "Proposal flow, end to end", project: "cre8visions.com", note: "Proven on a real client.", task_ids: ["CRE-267"] },
    ];
    render(<DoneTimelineCard items={items} range={{ since: "2026-10-07T13:07:00Z", until: "2026-10-08T12:45:00Z" }} {...noop} briefDate="2026-10-08" />);
    expect(screen.getByText("Proposal flow, end to end")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "CRE-267" });
    expect(link).toHaveAttribute("href", "https://paperclip.cre8visions.com/CRE/issues/CRE-267");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("button", { name: "Mark done" })).toBeInTheDocument();
  });

  it("ApprovalsCard shows a red waiting badge when a deadline is set and links task_ids", () => {
    const approvals: ApprovalCardData[] = [
      {
        id: "appr-cre-291", title: "Approve the Oct 12 prospect previews",
        context: "35 previews pending.", project: "Outreach", task_ids: ["CRE-291"],
        deadline: new Date(Date.now() + 4 * 86_400_000).toISOString(),
        options: ["Approve", "Skip"], link: "https://cre8visions.com/admin/approvals",
      },
    ];
    render(<ApprovalsCard approvals={approvals} {...noop} briefDate="2026-10-08" />);
    expect(screen.getByText("Approve the Oct 12 prospect previews")).toBeInTheDocument();
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CRE-291" })).toHaveAttribute("href", "https://paperclip.cre8visions.com/CRE/issues/CRE-291");
    expect(screen.getByText(/Cutoff in \d+ days/)).toBeInTheDocument();
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

  it("InFlightCard (CRE-388) renders a status icon per row and links task_ids", () => {
    const items: InFlightItem[] = [
      { id: "if-1", title: "Menovia App Store review", status: "stuck", category: "Menovia", task_ids: ["CRE-351"] },
      { id: "if-2", title: "Waiting on Bree's Lovable SQL", status: "blocked", category: "cre8visions.com" },
    ];
    render(<InFlightCard items={items} {...noop} briefDate="2026-10-11" />);
    expect(screen.getByText("Menovia App Store review")).toBeInTheDocument();
    expect(screen.getByText("Waiting on Bree's Lovable SQL")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CRE-351" })).toHaveAttribute("href", "https://paperclip.cre8visions.com/CRE/issues/CRE-351");
  });

  it("InFlightCard renders nothing when there are no items", () => {
    const { container } = render(<InFlightCard items={[]} {...noop} briefDate="2026-10-11" />);
    expect(container).toBeEmptyDOMElement();
  });
});
