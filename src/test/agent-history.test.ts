// One failed turn used to make a conversation permanently unusable: the failed
// row was filtered out of the replay, leaving two consecutive user messages,
// which the Messages API rejects with a 400. These pin the repair.
import { describe, it, expect } from "vitest";
import {
  normalizeTurns, describeTurnOutcome, type StoredTurn,
} from "../../supabase/functions/_shared/agents/history";

const alternates = (turns: Array<{ role: string }>) =>
  turns.every((t, i) => i === 0 || t.role !== turns[i - 1].role);

describe("normalizeTurns", () => {
  it("merges the gap a failed turn leaves instead of emitting two user turns", () => {
    const rows: StoredTurn[] = [
      { role: "user", content: "Write the Menovia proposal" },
      { role: "assistant", content: "" },            // the failed turn
      { role: "user", content: "Any update?" },
    ];
    const out = normalizeTurns(rows);
    expect(alternates(out)).toBe(true);
    expect(out).toHaveLength(1);
    // Neither half is lost — both are things she actually said.
    expect(out[0].content).toContain("Write the Menovia proposal");
    expect(out[0].content).toContain("Any update?");
  });

  it("opens on a user turn even when the window starts mid-reply", () => {
    // The 24-row window can begin on an assistant row, which previously landed
    // straight after a synthetic assistant turn — assistant, then assistant.
    const out = normalizeTurns([
      { role: "assistant", content: "…as I was saying" },
      { role: "user", content: "Go on" },
      { role: "assistant", content: "Here it is" },
      { role: "user", content: "Thanks" },
    ]);
    expect(out[0].role).toBe("user");
    expect(out[0].content).toBe("Go on");
    expect(alternates(out)).toBe(true);
  });

  it("never ends on an assistant turn", () => {
    const out = normalizeTurns([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);
    expect(out[out.length - 1].role).toBe("user");
  });

  it("drops whitespace-only content", () => {
    const out = normalizeTurns([
      { role: "user", content: "Real" },
      { role: "assistant", content: "   \n  " },
      { role: "user", content: "Also real" },
    ]);
    expect(out).toHaveLength(1);
  });

  it("returns an empty array rather than something invalid", () => {
    expect(normalizeTurns([])).toEqual([]);
    expect(normalizeTurns([{ role: "assistant", content: "orphan" }])).toEqual([]);
    expect(normalizeTurns([{ role: "user", content: null }])).toEqual([]);
  });

  it("always produces a strictly alternating array starting with user", () => {
    // The property that matters, over a deliberately hostile transcript.
    const hostile: StoredTurn[] = [
      { role: "assistant", content: "lead" },
      { role: "assistant", content: "another" },
      { role: "user", content: "a" },
      { role: "user", content: "b" },
      { role: "assistant", content: "" },
      { role: "user", content: "c" },
      { role: "assistant", content: "d" },
      { role: "assistant", content: null },
      { role: "assistant", content: "e" },
    ];
    const out = normalizeTurns(hostile);
    expect(out[0].role).toBe("user");
    expect(alternates(out)).toBe(true);
    expect(out.every((t) => t.content.trim().length > 0)).toBe(true);
  });
});

describe("describeTurnOutcome", () => {
  it("records that actions are waiting, so the agent does not re-propose them", () => {
    expect(describeTurnOutcome({ action_ids: ["a", "b"] }))
      .toContain("2 actions proposed");
  });

  it("records that questions were asked", () => {
    expect(describeTurnOutcome({ questions: [{ id: "q" }] }))
      .toContain("1 question asked");
  });

  it("says nothing when the turn was just an answer", () => {
    expect(describeTurnOutcome({ action_ids: [], questions: null })).toBe("");
  });
});

describe("describeTurnOutcome with the actions themselves", () => {
  it("names the deliverable so the next turn can find it instead of inventing one", () => {
    const note = describeTurnOutcome({
      action_ids: ["a"],
      actions: [{
        kind: "draft_proposal",
        status: "executed",
        title: "Menovia retainer",
        result: { proposal_id: "8f2c" },
      }],
    });
    expect(note).toContain("draft_proposal");
    expect(note).toContain("proposal 8f2c");
    expect(note).toContain("Menovia retainer");
  });

  it("is explicit that a merely proposed action has not happened yet", () => {
    const note = describeTurnOutcome({
      action_ids: ["a"],
      actions: [{ kind: "send_email", status: "proposed", title: "Chase Acme" }],
    });
    expect(note).toContain("does not exist yet");
  });
});
