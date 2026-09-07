import { describe, expect, it } from "vitest";
import {
  agentState, boardPulse, claimRunUrl, humanMinutes, minutesSince, pulseSentence,
  type AgentStateInput,
} from "@/lib/taskAgentState";
import { CLAIM_TTL_MINUTES } from "@/lib/queueHealth";

const NOW = new Date("2026-09-06T12:00:00Z");

function task(over: Partial<AgentStateInput> = {}): AgentStateInput {
  return {
    status: "in_progress",
    assignee_kind: "claude",
    claimed_by: null,
    claimed_at: null,
    open_blockers: [],
    ...over,
  };
}

function minutesAgo(m: number): string {
  return new Date(NOW.getTime() - m * 60_000).toISOString();
}

describe("minutesSince / humanMinutes", () => {
  it("returns null for a missing or unparseable timestamp", () => {
    expect(minutesSince(null, NOW)).toBeNull();
    expect(minutesSince("not a date", NOW)).toBeNull();
  });

  it("never returns a negative age for a clock skewed into the future", () => {
    expect(minutesSince(new Date(NOW.getTime() + 60_000).toISOString(), NOW)).toBe(0);
  });

  it("formats compactly", () => {
    expect(humanMinutes(0)).toBe("just now");
    expect(humanMinutes(12)).toBe("12m");
    expect(humanMinutes(60)).toBe("1h 00m");
    expect(humanMinutes(185)).toBe("3h 05m");
  });
});

describe("agentState", () => {
  it("reads a fresh claim as work in progress, with its age", () => {
    const s = agentState(task({ claimed_by: "gha-run-42", claimed_at: minutesAgo(12) }), NOW);
    expect(s.key).toBe("working");
    expect(s.label).toBe("Claude working · 12m");
    expect(s.tone).toBe("good");
    expect(s.detail).toContain("gha-run-42");
  });

  it("reads a claim past the TTL as stalled, not as work", () => {
    const s = agentState(
      task({ claimed_by: "gha-run-42", claimed_at: minutesAgo(CLAIM_TTL_MINUTES + 1) }),
      NOW,
    );
    expect(s.key).toBe("stalled");
    expect(s.tone).toBe("bad");
    expect(s.detail).toContain("Ready for Claude");
  });

  it("treats the TTL boundary itself as expired, matching the queue", () => {
    const s = agentState(
      task({ claimed_by: "w", claimed_at: minutesAgo(CLAIM_TTL_MINUTES) }),
      NOW,
    );
    expect(s.key).toBe("stalled");
  });

  it("a live claim wins over open blockers, because something is already doing it", () => {
    const s = agentState(
      task({ claimed_by: "w", claimed_at: minutesAgo(3), open_blockers: ["Set up the repo"] }),
      NOW,
    );
    expect(s.key).toBe("working");
  });

  it("names the blocker rather than showing a count", () => {
    const s = agentState(task({ open_blockers: ["Set up the repo"] }), NOW);
    expect(s.key).toBe("waiting_on_blockers");
    expect(s.label).toBe("Waiting on Set up the repo");
    expect(s.detail).toContain("is not complete");
  });

  it("lists two blockers, then summarises", () => {
    expect(agentState(task({ open_blockers: ["A", "B"] }), NOW).label)
      .toBe("Waiting on A and B");
    expect(agentState(task({ open_blockers: ["A", "B", "C"] }), NOW).label)
      .toBe("Waiting on A and 2 others");
  });

  it("flags in-progress work that nobody is holding", () => {
    const s = agentState(task(), NOW);
    expect(s.key).toBe("orphaned");
    expect(s.tone).toBe("warn");
  });

  it("calls a ready, Claude-assigned task queued", () => {
    const s = agentState(task({ status: "ready_for_claude" }), NOW);
    expect(s.key).toBe("queued");
    expect(s.tone).toBe("good");
  });

  it("warns when a task sits in Ready but is not assigned to Claude", () => {
    const s = agentState(task({ status: "ready_for_claude", assignee_kind: "agency" }), NOW);
    expect(s.key).toBe("idle");
    expect(s.tone).toBe("warn");
    expect(s.label).toContain("not assigned to Claude");
  });

  it("says needs_review is waiting on a person", () => {
    expect(agentState(task({ status: "needs_review" }), NOW).key).toBe("awaiting_review");
  });

  it("says nothing about backlog or complete tasks", () => {
    expect(agentState(task({ status: "backlog" }), NOW).label).toBe("");
    expect(agentState(task({ status: "complete" }), NOW).label).toBe("");
  });

  it("survives a claim with no timestamp", () => {
    const s = agentState(task({ claimed_by: "w", claimed_at: null }), NOW);
    expect(s.key).toBe("working");
    expect(s.label).toBe("Claude working");
  });
});

describe("boardPulse / pulseSentence", () => {
  const board: AgentStateInput[] = [
    task({ claimed_by: "w", claimed_at: minutesAgo(5) }),
    task({ claimed_by: "w", claimed_at: minutesAgo(400) }),
    task({ status: "ready_for_claude" }),
    task({ status: "backlog", open_blockers: ["A"] }),
    task({ status: "needs_review" }),
    task(),
    task({ status: "complete" }),
  ];

  it("counts each state once", () => {
    expect(boardPulse(board, NOW)).toEqual({
      working: 1, stalled: 1, queued: 1, waiting: 1, needsReview: 1, orphaned: 1,
    });
  });

  it("leads with the bad news when something is stalled", () => {
    const { tone, text } = pulseSentence(boardPulse(board, NOW));
    expect(tone).toBe("bad");
    expect(text).toContain("1 stalled");
  });

  it("does not claim health when there is nothing to report", () => {
    const { text, tone } = pulseSentence(boardPulse([task({ status: "complete" })], NOW));
    expect(text).toBe("Nothing in the coding queue.");
    expect(tone).toBe("muted");
  });

  it("reads as good when work is simply in flight", () => {
    const p = boardPulse([task({ claimed_by: "w", claimed_at: minutesAgo(2) })], NOW);
    expect(pulseSentence(p)).toEqual({ text: "1 being worked on", tone: "good" });
  });
});

describe("claimRunUrl", () => {
  it("links a gha-<run_id> claim to its Actions run", () => {
    expect(claimRunUrl("gha-33990859816"))
      .toBe("https://github.com/tambriakemp/straight-copy/actions/runs/33990859816");
  });

  it("tolerates surrounding whitespace", () => {
    expect(claimRunUrl(" gha-1 ")).toContain("/runs/1");
  });

  it("refuses to guess for any other claim", () => {
    expect(claimRunUrl(null)).toBeNull();
    expect(claimRunUrl("claude-routine")).toBeNull();
    expect(claimRunUrl("gha-abc")).toBeNull();
    expect(claimRunUrl("gha-12-retry")).toBeNull();
  });
});
