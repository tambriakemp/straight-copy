// CRE-366: renders each redesigned brief card with data shaped like the
// approved mockup to prove the components actually mount and produce the
// expected DOM — not just that they typecheck.
//
// CRE-391: DoneTimelineCard, ApprovalsCard and InFlightCard are retired —
// Done is dropped from the Today page outright, and approvals/in-flight now
// render as plain NeedsYouRow entries in the merged list (see
// needs-you-rows.test.ts for that conversion's coverage). Money and
// Pipeline are the only dedicated cards left.
//
// Relaid out to the Admin Journeys canvas: Pipeline's four-stage funnel is
// gone (/admin/pipeline is a board of the same five columns), so this file
// no longer mocks pipeline-board — the card does no fetch at all now. The
// funnel assertions below were replaced rather than deleted: what they
// proved, that the card renders the round and the leads, is still checked.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import MoneyCard from "../components/admin/cv/MoneyCard";
import PipelineBriefCard from "../components/admin/cv/PipelineBriefCard";
import type { MoneyStats, BriefPipeline } from "../lib/briefs";

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
    const { container } = render(<MoneyCard stats={stats} />);
    expect(screen.getByText("Deposits this week")).toBeInTheDocument();
    expect(screen.getByText(/\$2,500/)).toBeInTheDocument();
    expect(screen.getByText("$0 open")).toBeInTheDocument();
    expect(screen.getByText("vs last week")).toBeInTheDocument();
    expect(screen.getByText(/No other payments found overnight/)).toBeInTheDocument();
    expect(screen.getByText("Stripe + SureCart email confirmations")).toBeInTheDocument();
    expect(container.querySelector("button")).toBeNull(); // no checkboxes anywhere in Money
  });

  it("inverts the first tile and only the first", () => {
    // The brief writes its cards in the order it wants them read, so the
    // headline figure is the first one, not whichever has a known id.
    const { container } = render(<MoneyCard stats={{ cards: [
      { id: "a", label: "Deposits", display: "$10" },
      { id: "b", label: "Open", display: "$20" },
    ] }} />);
    const tiles = [...container.querySelectorAll(".cv-tile")];
    expect(tiles).toHaveLength(2);
    expect(tiles[0].className).toContain("cv-tile--lead");
    expect(tiles[1].className).not.toContain("cv-tile--lead");
  });

  it("MoneyCard renders nothing when there are no cards", () => {
    const { container } = render(<MoneyCard stats={{ cards: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("PipelineBriefCard renders the outreach round and each hot lead", () => {
    const pipeline: BriefPipeline = {
      outreach_round: {
        date: "2026-10-12", pending: 35,
        cutoff: new Date(Date.now() + 4 * 86_400_000).toISOString(),
        note: "Still pending at the cutoff rolls over to next month's batch.",
      },
      hot_leads: [{
        id: "lead-kahin", name: "Dr. Kahin · Menovia",
        status: "Telehealth proposal sent for her review.",
        stage: "Proposal sent", task_id: "CRE-267",
      }],
    };
    render(<PipelineBriefCard pipeline={pipeline} {...noop} briefDate="2026-10-08" />);

    expect(screen.getByText("35 pending")).toBeInTheDocument();
    expect(screen.getByText(/Still pending at the cutoff rolls over/)).toBeInTheDocument();
    expect(screen.getByText("Cutoff in 4 days")).toBeInTheDocument();
    expect(screen.getByText("Dr. Kahin · Menovia")).toBeInTheDocument();
    expect(screen.getByText("Proposal sent")).toHaveClass("cv-chip--amber");
    expect(screen.getByRole("link", { name: "CRE-267" }))
      .toHaveAttribute("href", "https://paperclip.cre8visions.com/CRE/issues/CRE-267");
  });

  it("PipelineBriefCard renders nothing without a round or a lead", () => {
    // It used to render a stage funnel off a live fetch whatever the brief
    // said, so it was never empty. Now there is nothing to show.
    const { container } = render(
      <PipelineBriefCard pipeline={{ hot_leads: [] }} {...noop} briefDate="2026-10-08" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
