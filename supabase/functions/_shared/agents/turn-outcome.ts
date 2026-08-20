// What a finished turn is allowed to be written as.
//
// On 20 Aug at 06:37 Bree asked Bria for a proposal draft and the reply row
// came back role=assistant, status=complete, length(content)=0. The chat
// renders that as a blank bubble with no spinner and no error, which is
// indistinguishable from a turn that died — "she looks like she timed out but
// i can't tell". It was the second time an empty message caused exactly that.
//
// Both completion paths in agent-chat had a guard, and the legacy one had a
// hole: `!reply.trim() && !questions.length && !actionIds.length` lets a blank
// reply through whenever it carries questions or actions. So the rule lives
// here instead, in one place both paths call, and the invariant is stated
// once: a turn written as `complete` always has something to read.
//
// No `npm:` specifiers in this file — the frontend vitest suite imports it,
// and a Deno specifier does not resolve under the app's tsconfig.

export type TurnStatus = "complete" | "failed";

export interface TurnInput {
  /** The model's reply text. May be blank; that is the case this exists for. */
  text: string;
  /** Choice-list questions attached to the turn, if any. */
  questionCount?: number;
  /** Actions proposed or executed during the turn. */
  actionCount?: number;
  /** Why the tool loop stopped: "end_turn" | "iterations" | "budget" | … */
  stoppedBy?: string | null;
  /** The model's own stop_reason, when it is known. */
  stopReason?: string | null;
  /** An explicit failure that already happened. Wins over everything. */
  error?: string | null;
  /** Human-readable labels of what the turn looked at, newest last. */
  toolLabels?: string[];
}

export interface TurnOutcome {
  status: TurnStatus;
  /** Never blank when status is "complete". */
  content: string;
  /** Why it failed, or null. */
  error: string | null;
  /** Recorded on the row so the next occurrence is diagnosable. */
  stoppedBy: string | null;
}

const EMPTY =
  "The reply came back empty. Send the message again.";

const TRUNCATED =
  "That answer ran past the length limit before it finished. Ask for it in " +
  "smaller pieces — one section at a time — or narrow the request.";

/** At most this many tool labels are named back; past that it is a wall. */
const MAX_LABELS = 6;

function exhaustedMessage(labels: string[]): string {
  const seen = labels.filter((l) => l && l.trim()).slice(-MAX_LABELS);
  const looked = seen.length
    ? ` I got as far as: ${seen.join("; ")}.`
    : "";
  return (
    "I ran out of steps before I finished this one." + looked +
    " Ask me for a narrower piece of it and I will get there."
  );
}

/**
 * Decide how a finished turn is persisted.
 *
 * The one guarantee: when `status` is "complete", `content` is non-blank. Every
 * branch that would otherwise write nothing either explains itself or fails.
 */
export function resolveTurnOutcome(input: TurnInput): TurnOutcome {
  const stoppedBy = input.stoppedBy ?? input.stopReason ?? null;
  const text = (input.text ?? "").trim();
  const questions = input.questionCount ?? 0;
  const actions = input.actionCount ?? 0;

  // An explicit failure is already a failure; nothing below can rescue it.
  if (input.error) {
    return { status: "failed", content: "", error: input.error, stoppedBy };
  }

  if (text) {
    return { status: "complete", content: text, error: null, stoppedBy };
  }

  // Blank text, but the turn carries something the UI will render. Describe
  // what follows rather than leaving the bubble empty above it. This is the
  // hole the legacy guard had.
  if (questions > 0) {
    return {
      status: "complete",
      content: questions === 1
        ? "One thing before I go on:"
        : "A couple of things before I go on:",
      error: null,
      stoppedBy,
    };
  }
  if (actions > 0) {
    return {
      status: "complete",
      content: actions === 1
        ? "Proposed the work below."
        : `Proposed ${actions} pieces of work below.`,
      error: null,
      stoppedBy,
    };
  }

  // Blank, with nothing attached. Say why, as specifically as we can.
  if (stoppedBy === "iterations" || stoppedBy === "budget") {
    // Not a failure — it did real work, it just could not land it. Naming what
    // it examined beats a retry button that would exhaust the budget again.
    return {
      status: "complete",
      content: exhaustedMessage(input.toolLabels ?? []),
      error: null,
      stoppedBy,
    };
  }
  if (stoppedBy === "max_tokens") {
    return { status: "failed", content: "", error: TRUNCATED, stoppedBy };
  }

  return { status: "failed", content: "", error: EMPTY, stoppedBy };
}

/**
 * The columns to write for a finished turn. Callers spread this into their
 * update so they cannot accidentally set `status` and `content` apart from
 * each other.
 */
export function turnColumns(outcome: TurnOutcome): {
  status: TurnStatus;
  content: string;
  error: string | null;
  stopped_by: string | null;
  completed_at: string;
} {
  return {
    status: outcome.status,
    content: outcome.content,
    error: outcome.error,
    stopped_by: outcome.stoppedBy,
    completed_at: new Date().toISOString(),
  };
}
