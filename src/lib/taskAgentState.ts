// What is happening to this task right now, in words.
//
// The board had no answer to the only question that matters once work is
// automated: is something actually happening? A task sat in "In progress" and
// that column meant three completely different things — a worker holding it and
// typing, a worker that died an hour ago and left the claim behind, and a task
// nobody has started because its blockers are unfinished. All three looked
// identical, so the honest reading of the board was "no idea", and the only way
// to find out was to go and read the GitHub Actions log.
//
// The distinguishing facts were all in the database already: `claimed_by` and
// `claimed_at` (a claim expires after CLAIM_TTL_MINUTES, so its age is the
// difference between working and dead), `blocked_by`, and the fire log. They
// just never reached the screen — TASK_FIELDS didn't select the claim columns.
//
// Pure on purpose: rows and a clock in, a state out, no Supabase. The rules are
// the part worth testing.

import { CLAIM_TTL_MINUTES } from "./queueHealth";

export type AgentTone = "good" | "warn" | "bad" | "muted";

export interface AgentStateInput {
  status: string;
  assignee_kind: string;
  claimed_by: string | null;
  claimed_at: string | null;
  /** Blockers that are not `complete` yet, already resolved to names. */
  open_blockers: string[];
}

export interface AgentState {
  /** Stable key for tests and styling. */
  key:
    | "working"
    | "stalled"
    | "waiting_on_blockers"
    | "queued"
    | "orphaned"
    | "awaiting_review"
    | "idle";
  /** Short enough for a card badge. */
  label: string;
  tone: AgentTone;
  /** One sentence: what this means, and what to do if anything. */
  detail: string;
}

const MINUTE = 60_000;

export function minutesSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / MINUTE));
}

/** "just now", "12m", "3h 05m" — compact, because this goes on a card. */
export function humanMinutes(mins: number): string {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function blockerPhrase(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} others`;
}

/**
 * The one rule that matters: a claim is only evidence of work while it is
 * fresh. Past the TTL it is evidence of a worker that stopped.
 */
export function agentState(task: AgentStateInput, now: Date = new Date()): AgentState {
  const claimAge = minutesSince(task.claimed_at, now);
  const held = Boolean(task.claimed_by);
  const stale = claimAge !== null && claimAge >= CLAIM_TTL_MINUTES;
  const forClaude = task.assignee_kind === "claude";

  if (held && !stale) {
    const age = claimAge === null ? "" : ` · ${humanMinutes(claimAge)}`;
    return {
      key: "working",
      label: `Claude working${age}`,
      tone: "good",
      detail:
        `Held by ${task.claimed_by} since ` +
        `${claimAge === null ? "an unknown time" : humanMinutes(claimAge) + " ago"}. ` +
        "Runs are quiet until they finish, so no news here is normal. " +
        `A claim older than ${CLAIM_TTL_MINUTES} minutes is treated as abandoned.`,
    };
  }

  if (held && stale) {
    return {
      key: "stalled",
      label: `Stalled · ${humanMinutes(claimAge ?? 0)}`,
      tone: "bad",
      detail:
        `${task.claimed_by} claimed this ${humanMinutes(claimAge ?? 0)} ago and never finished, ` +
        `which is past the ${CLAIM_TTL_MINUTES}-minute claim expiry — the run almost certainly died. ` +
        "The next worker is free to take it, but nothing will wake one until this task " +
        "moves back into Ready for Claude.",
    };
  }

  // Nothing holds it. What it is waiting for depends on why.
  if (task.open_blockers.length > 0) {
    return {
      key: "waiting_on_blockers",
      label: `Waiting on ${blockerPhrase(task.open_blockers)}`,
      tone: "muted",
      detail:
        `Not started, and deliberately so: ${blockerPhrase(task.open_blockers)} ` +
        `${task.open_blockers.length === 1 ? "is" : "are"} not complete. ` +
        "A queue fire for this task is logged and skipped rather than burning a run. " +
        "Finish the blocker, or clear it from Blocked by if it no longer applies.",
    };
  }

  if (task.status === "in_progress") {
    return {
      key: "orphaned",
      label: "In progress, unclaimed",
      tone: "warn",
      detail:
        "Sitting in In progress with no worker holding it. Either a person is doing this by " +
        "hand, or a run dropped it. Nothing will pick it up automatically: move it back to " +
        "Ready for Claude to wake a worker.",
    };
  }

  if (task.status === "ready_for_claude") {
    return forClaude
      ? {
          key: "queued",
          label: "Queued for Claude",
          tone: "good",
          detail:
            "Ready and assigned to Claude. The next run takes it — a run started by any task " +
            "on any board works the whole queue, so it does not need its own fire.",
        }
      : {
          key: "idle",
          label: "Ready, not assigned to Claude",
          tone: "warn",
          detail:
            "In the Ready for Claude column but assigned to someone else, so the queue " +
            "ignores it by design. Set the assignee to Claude if it is coding work.",
        };
  }

  if (task.status === "needs_review") {
    return {
      key: "awaiting_review",
      label: "Waiting on you",
      tone: "warn",
      detail:
        "The worker finished and asked for eyes. Read its comment: it says what changed, " +
        "what it could not check itself, and links the pull request.",
    };
  }

  return { key: "idle", label: "", tone: "muted", detail: "" };
}

/** Board-level counts, for the strip above the columns. */
export interface BoardPulse {
  working: number;
  stalled: number;
  queued: number;
  waiting: number;
  needsReview: number;
  orphaned: number;
}

export function boardPulse(tasks: AgentStateInput[], now: Date = new Date()): BoardPulse {
  const pulse: BoardPulse = {
    working: 0, stalled: 0, queued: 0, waiting: 0, needsReview: 0, orphaned: 0,
  };
  for (const t of tasks) {
    switch (agentState(t, now).key) {
      case "working": pulse.working++; break;
      case "stalled": pulse.stalled++; break;
      case "queued": pulse.queued++; break;
      case "waiting_on_blockers": pulse.waiting++; break;
      case "awaiting_review": pulse.needsReview++; break;
      case "orphaned": pulse.orphaned++; break;
    }
  }
  return pulse;
}

/**
 * One line for the strip. Deliberately says "quiet" rather than "healthy" when
 * there is nothing to report: the board cannot tell the difference between a
 * queue with no work and a queue that has stopped firing, and /admin/queue is
 * where that question gets answered.
 */
export function pulseSentence(p: BoardPulse): { text: string; tone: AgentTone } {
  const parts: string[] = [];
  if (p.working) parts.push(`${p.working} being worked on`);
  if (p.queued) parts.push(`${p.queued} queued`);
  if (p.waiting) parts.push(`${p.waiting} waiting on blockers`);
  if (p.needsReview) parts.push(`${p.needsReview} waiting on you`);
  if (p.orphaned) parts.push(`${p.orphaned} in progress with nobody on it`);
  if (p.stalled) parts.push(`${p.stalled} stalled`);
  if (parts.length === 0) return { text: "Nothing in the coding queue.", tone: "muted" };
  const tone: AgentTone = p.stalled ? "bad" : p.orphaned ? "warn" : p.working ? "good" : "muted";
  return { text: parts.join(" · "), tone };
}

/**
 * The repository the coding worker runs in. Every board's work happens in this
 * one workflow, whatever repo the code lands in, so a claim of `gha-<run_id>`
 * always points at a run here.
 */
export const QUEUE_WORKER_REPO = "tambriakemp/straight-copy";

/**
 * A link to the Actions run holding this task, when the claim names one.
 *
 * The prompt asks workers to claim as `gha-<run_id>` precisely so a claim can be
 * traced back to the job that made it. Anything else — a claude.ai routine, a
 * person, an older convention — returns null rather than a guessed URL.
 */
export function claimRunUrl(claimedBy: string | null): string | null {
  if (!claimedBy) return null;
  const m = /^gha-(\d+)$/.exec(claimedBy.trim());
  return m ? `https://github.com/${QUEUE_WORKER_REPO}/actions/runs/${m[1]}` : null;
}
