// The loop is what turns a templated LLM call into an agent, so its invariants
// are worth pinning: it must terminate, it must answer every tool_use, it must
// resume a paused turn, and it must not let one stuck call run forever.
import { describe, it, expect, vi } from "vitest";
import { runToolLoop, type LoopStep } from "../../supabase/functions/_shared/agents/loop";

type Block = Record<string, unknown>;

/** A stand-in Anthropic client that replays scripted responses. */
function stubClient(script: Array<{ stop_reason: string; content: Block[] }>) {
  let call = 0;
  const sent: Array<Record<string, unknown>> = [];
  return {
    sent,
    calls: () => call,
    client: {
      messages: {
        stream(params: Record<string, unknown>) {
          sent.push(params);
          const next = script[Math.min(call, script.length - 1)];
          call++;
          return {
            finalMessage: () => Promise.resolve({
              ...next,
              usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2 },
            }),
          };
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  };
}

const base = {
  model: "claude-opus-5",
  effort: "high",
  system: [{ type: "text" as const, text: "sys" }],
  tools: [],
  messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "hello" }] }],
  maxIterations: 6,
  budgetMs: 60_000,
  labelFor: (n: string) => `running ${n}`,
};

const text = (t: string) => ({ type: "text", text: t });
const toolUse = (id: string, name: string, input: Block = {}) =>
  ({ type: "tool_use", id, name, input });

describe("runToolLoop", () => {
  it("returns the answer when the model stops without calling a tool", async () => {
    const { client } = stubClient([{ stop_reason: "end_turn", content: [text("Here it is.")] }]);
    const out = await runToolLoop({ ...base, client, dispatch: vi.fn() });
    expect(out.text).toBe("Here it is.");
    expect(out.stoppedBy).toBe("end_turn");
    expect(out.iterations).toBe(1);
  });

  it("runs a tool, feeds the result back, and answers", async () => {
    const { client } = stubClient([
      { stop_reason: "tool_use", content: [toolUse("t1", "search", { q: "Menovia" })] },
      { stop_reason: "end_turn", content: [text("Found them.")] },
    ]);
    const dispatch = vi.fn().mockResolvedValue({ ok: true, content: '{"rows":[]}' });
    const out = await runToolLoop({ ...base, client, dispatch });

    expect(dispatch).toHaveBeenCalledWith("search", { q: "Menovia" });
    expect(out.text).toBe("Found them.");
    expect(out.calls).toEqual([{ name: "search", input: { q: "Menovia" } }]);
  });

  it("answers every tool_use in a single user message", async () => {
    // Splitting results across messages trains the model out of parallel calls.
    const { client } = stubClient([
      { stop_reason: "tool_use", content: [toolUse("a", "search"), toolUse("b", "query")] },
      { stop_reason: "end_turn", content: [text("done")] },
    ]);
    const out = await runToolLoop({
      ...base, client,
      dispatch: vi.fn().mockResolvedValue({ ok: true, content: "{}" }),
    });
    const resultTurns = out.messages.filter(
      (m) => Array.isArray(m.content) &&
        (m.content as Block[]).some((b) => b.type === "tool_result"),
    );
    expect(resultTurns).toHaveLength(1);
    expect((resultTurns[0].content as Block[])).toHaveLength(2);
  });

  it("reports a failed tool as an error result rather than dropping it", async () => {
    // An unanswered tool_use is a malformed conversation.
    const { client } = stubClient([
      { stop_reason: "tool_use", content: [toolUse("t1", "query")] },
      { stop_reason: "end_turn", content: [text("ok")] },
    ]);
    const out = await runToolLoop({
      ...base, client,
      dispatch: vi.fn().mockResolvedValue({ ok: false, content: "nope" }),
    });
    const result = (out.messages
      .flatMap((m) => (Array.isArray(m.content) ? m.content : [])) as Block[])
      .find((b) => b.type === "tool_result");
    expect(result?.is_error).toBe(true);
    expect(result?.content).toBe("nope");
  });

  it("resumes a paused turn instead of treating it as the answer", async () => {
    // Web search makes pause_turn common; unhandled it looks like a randomly
    // truncated answer, which is the worst possible failure mode.
    const { client } = stubClient([
      { stop_reason: "pause_turn", content: [text("partway")] },
      { stop_reason: "end_turn", content: [text("the whole answer")] },
    ]);
    const out = await runToolLoop({ ...base, client, dispatch: vi.fn() });
    expect(out.text).toBe("the whole answer");
    expect(out.stoppedBy).toBe("end_turn");
  });

  it("refuses a call it has already run twice", async () => {
    const { client } = stubClient([
      { stop_reason: "tool_use", content: [toolUse("x", "search", { q: "same" })] },
    ]);
    const dispatch = vi.fn().mockResolvedValue({ ok: true, content: "{}" });
    const out = await runToolLoop({ ...base, client, dispatch, maxIterations: 5 });
    // Ran twice, then refused — it does not keep hitting the database.
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(out.stoppedBy).toBe("iterations");
  });

  it("always terminates at the iteration cap", async () => {
    const { client } = stubClient([
      { stop_reason: "tool_use", content: [toolUse("loop", "query", { n: Math.random() })] },
    ]);
    const out = await runToolLoop({
      ...base, client, maxIterations: 3,
      dispatch: vi.fn().mockResolvedValue({ ok: true, content: "{}" }),
    });
    expect(out.iterations).toBe(3);
    expect(out.stoppedBy).toBe("iterations");
  });

  it("takes the tools away on the final pass so it has to answer", async () => {
    const stub = stubClient([
      { stop_reason: "tool_use", content: [toolUse("t", "query")] },
      { stop_reason: "end_turn", content: [text("fine")] },
    ]);
    await runToolLoop({
      ...base, client: stub.client, maxIterations: 2,
      dispatch: vi.fn().mockResolvedValue({ ok: true, content: "{}" }),
    });
    expect(stub.sent[0].tool_choice).toEqual({ type: "auto" });
    expect(stub.sent[1].tool_choice).toEqual({ type: "none" });
  });

  it("stops on a refusal without pretending it answered", async () => {
    const { client } = stubClient([{ stop_reason: "refusal", content: [] }]);
    const out = await runToolLoop({ ...base, client, dispatch: vi.fn() });
    expect(out.stoppedBy).toBe("refusal");
    expect(out.text).toBe("");
  });

  it("surfaces an API failure instead of throwing", async () => {
    const client = {
      messages: { stream: () => { throw new Error("upstream exploded"); } },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const out = await runToolLoop({ ...base, client, dispatch: vi.fn() });
    expect(out.stoppedBy).toBe("error");
    expect(out.error).toContain("upstream exploded");
  });

  it("keeps exactly one rolling cache breakpoint as the transcript grows", async () => {
    // Four breakpoints is the hard limit, and re-billing the whole accumulated
    // transcript each pass is what makes a long turn unaffordable.
    const stub = stubClient([
      { stop_reason: "tool_use", content: [toolUse("t1", "query")] },
      { stop_reason: "tool_use", content: [toolUse("t2", "query", { p: 2 })] },
      { stop_reason: "end_turn", content: [text("done")] },
    ]);
    await runToolLoop({
      ...stub, ...base, client: stub.client,
      dispatch: vi.fn().mockResolvedValue({ ok: true, content: "{}" }),
    });
    for (const params of stub.sent) {
      const blocks = (params.messages as Array<{ content: unknown }>)
        .flatMap((m) => (Array.isArray(m.content) ? m.content : [])) as Block[];
      const marked = blocks.filter((b) => b.cache_control);
      expect(marked.length).toBeLessThanOrEqual(1);
      // The marker is ours and must never reach the API.
      expect(blocks.some((b) => "__rolling" in b)).toBe(false);
    }
  });

  it("reports progress steps in order", async () => {
    const steps: LoopStep[] = [];
    const { client } = stubClient([
      { stop_reason: "tool_use", content: [toolUse("t", "search", { q: "x" })] },
      { stop_reason: "end_turn", content: [text("ok")] },
    ]);
    await runToolLoop({
      ...base, client,
      dispatch: vi.fn().mockResolvedValue({ ok: true, content: "{}" }),
      onStep: async (s) => { steps.push(s); },
    });
    expect(steps.map((s) => s.seq)).toEqual([0, 1]);
    expect(steps[0].status).toBe("running");
    expect(steps[1].status).toBe("ok");
  });

  it("never lets a broken step writer take down the turn", async () => {
    const { client } = stubClient([
      { stop_reason: "tool_use", content: [toolUse("t", "query")] },
      { stop_reason: "end_turn", content: [text("survived")] },
    ]);
    const out = await runToolLoop({
      ...base, client,
      dispatch: vi.fn().mockResolvedValue({ ok: true, content: "{}" }),
      onStep: () => Promise.reject(new Error("realtime is down")),
    });
    expect(out.text).toBe("survived");
  });
});
