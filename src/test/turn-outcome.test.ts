import { describe, expect, it } from "vitest";
import {
  resolveTurnOutcome,
  turnColumns,
} from "../../supabase/functions/_shared/agents/turn-outcome";

describe("resolveTurnOutcome", () => {
  it("writes real text as a completed turn", () => {
    const out = resolveTurnOutcome({ text: "Here is the draft.", stoppedBy: "end_turn" });
    expect(out.status).toBe("complete");
    expect(out.content).toBe("Here is the draft.");
    expect(out.error).toBeNull();
  });

  it("trims, so whitespace is not mistaken for content", () => {
    const out = resolveTurnOutcome({ text: "   \n\t  " });
    expect(out.status).toBe("failed");
    expect(out.error).toBeTruthy();
  });

  // The 06:37 incident: blank content saved as complete, rendering a bubble
  // that neither moved nor explained itself.
  it("never completes a blank reply with nothing attached", () => {
    const out = resolveTurnOutcome({ text: "" });
    expect(out.status).toBe("failed");
    expect(out.error).toContain("empty");
  });

  // The hole in the legacy guard: `!reply.trim() && !questions.length` lets a
  // blank reply through as soon as it carries questions.
  it("gives a blank reply carrying questions something to read", () => {
    const out = resolveTurnOutcome({ text: "", questionCount: 2 });
    expect(out.status).toBe("complete");
    expect(out.content.trim()).not.toBe("");
  });

  it("gives a blank reply carrying actions something to read", () => {
    const one = resolveTurnOutcome({ text: "", actionCount: 1 });
    expect(one.status).toBe("complete");
    expect(one.content.trim()).not.toBe("");

    const many = resolveTurnOutcome({ text: "", actionCount: 3 });
    expect(many.content).toContain("3");
  });

  it("reports truncation as a failure with length guidance", () => {
    const out = resolveTurnOutcome({ text: "", stopReason: "max_tokens" });
    expect(out.status).toBe("failed");
    expect(out.error).toContain("length limit");
    expect(out.stoppedBy).toBe("max_tokens");
  });

  it("returns partial findings when the loop runs out of steps", () => {
    const out = resolveTurnOutcome({
      text: "",
      stoppedBy: "iterations",
      toolLabels: ["Searched clients for Menovia", "Read proposal — Aviya Telemed"],
    });
    expect(out.status).toBe("complete");
    expect(out.content).toContain("Menovia");
    expect(out.content).toContain("Aviya Telemed");
    expect(out.stoppedBy).toBe("iterations");
  });

  it("still explains itself when it ran out of steps having looked at nothing", () => {
    const out = resolveTurnOutcome({ text: "", stoppedBy: "budget", toolLabels: [] });
    expect(out.status).toBe("complete");
    expect(out.content.trim()).not.toBe("");
  });

  it("caps how many tool labels it reads back", () => {
    const labels = Array.from({ length: 20 }, (_, i) => `Step ${i}`);
    const out = resolveTurnOutcome({ text: "", stoppedBy: "iterations", toolLabels: labels });
    // Keeps the most recent, drops the rest.
    expect(out.content).toContain("Step 19");
    expect(out.content).not.toContain("Step 0");
  });

  it("lets an explicit error win over everything else", () => {
    const out = resolveTurnOutcome({
      text: "ignored",
      actionCount: 2,
      error: "the tool blew up",
    });
    expect(out.status).toBe("failed");
    expect(out.error).toBe("the tool blew up");
  });

  it("records why the turn stopped even on success", () => {
    const out = resolveTurnOutcome({ text: "done", stoppedBy: "end_turn" });
    expect(out.stoppedBy).toBe("end_turn");
  });
});

describe("turnColumns", () => {
  it("keeps status and content together so they cannot drift apart", () => {
    const cols = turnColumns(resolveTurnOutcome({ text: "hello" }));
    expect(cols.status).toBe("complete");
    expect(cols.content).toBe("hello");
    expect(cols.completed_at).toBeTruthy();
  });

  // The invariant, asserted over the whole input space rather than one case.
  it("never emits complete with blank content, whatever it is given", () => {
    const texts = ["", "   ", "real"];
    const counts = [0, 1, 3];
    const stops = [null, "end_turn", "iterations", "budget", "max_tokens", "refusal"];
    for (const text of texts) {
      for (const questionCount of counts) {
        for (const actionCount of counts) {
          for (const stoppedBy of stops) {
            const cols = turnColumns(
              resolveTurnOutcome({ text, questionCount, actionCount, stoppedBy }),
            );
            if (cols.status === "complete") {
              expect(cols.content.trim()).not.toBe("");
            } else {
              expect(cols.error).toBeTruthy();
            }
          }
        }
      }
    }
  });
});
