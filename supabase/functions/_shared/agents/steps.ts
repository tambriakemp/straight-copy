// Writing the agent's progress where the chat can see it.
//
// Two writes per tool call — one when it starts, one when it finishes — and one
// line per thinking block. Deliberately not streaming deltas: nobody reads
// reasoning word by word, and every write is a realtime broadcast.
import type { LoopStep } from "./loop.ts";

interface StepsClient {
  from(table: string): {
    insert(row: Record<string, unknown>): {
      select(columns: string): { maybeSingle(): PromiseLike<{ data: { id: string } | null }> };
    };
    update(patch: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<unknown>;
    };
  };
}

/** Cap on `detail`, which is for context rather than a full payload dump. */
const MAX_DETAIL_CHARS = 1_000;

export function stepWriter(sb: StepsClient, messageId: string) {
  // A tool's start and finish share a seq, so the finish updates the row the
  // start created rather than adding a second line for the same call.
  const rows = new Map<number, string>();

  return async (step: LoopStep): Promise<void> => {
    const detail = step.detail
      ? JSON.parse(JSON.stringify(step.detail).slice(0, MAX_DETAIL_CHARS).replace(/[^}\]"]*$/, "") || "{}")
      : null;

    const existing = rows.get(step.seq);
    if (existing) {
      await sb.from("agent_message_steps")
        .update({ status: step.status, detail })
        .eq("id", existing);
      return;
    }

    const { data } = await sb.from("agent_message_steps").insert({
      message_id: messageId,
      seq: step.seq,
      kind: step.kind,
      tool_name: step.toolName ?? null,
      label: step.label,
      status: step.status,
      detail,
    }).select("id").maybeSingle();

    if (data?.id) rows.set(step.seq, data.id);
  };
}

/**
 * Pair a tool's running and finished steps under one seq.
 *
 * The loop emits both with the same label; without this they would land as two
 * lines saying the same thing, one of them permanently stuck on "running".
 */
export function pairedStepWriter(sb: StepsClient, messageId: string) {
  const write = stepWriter(sb, messageId);
  const bySignature = new Map<string, number>();
  let nextSeq = 0;

  return async (step: LoopStep): Promise<void> => {
    if (step.kind !== "tool") {
      await write({ ...step, seq: nextSeq++ });
      return;
    }
    const signature = `${step.toolName}:${step.label}`;
    if (step.status === "running") {
      const seq = nextSeq++;
      bySignature.set(signature, seq);
      await write({ ...step, seq });
      return;
    }
    const seq = bySignature.get(signature);
    await write({ ...step, seq: seq ?? nextSeq++ });
    bySignature.delete(signature);
  };
}
