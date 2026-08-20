// Turning stored chat rows into a message array the API will accept.
//
// This exists because of a bug that made a conversation permanently unusable.
// Failed and empty assistant rows are filtered out of the replay, which leaves
// two consecutive `user` messages — and the Messages API rejects non-alternating
// roles with a 400. So one failed turn poisoned every later turn in that thread,
// and the only way out was starting a new conversation.
//
// Import-free on purpose: every shared module the frontend tests reach avoids
// Deno `npm:` specifiers, and the alternation rules are exactly the kind of
// thing that should be pinned by tests rather than discovered in production.

export interface StoredTurn {
  role: string;
  content: string | null;
}

export interface ReplayTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Normalise stored rows into a valid `messages` array.
 *
 * Four rules, in order:
 *   1. Drop turns with no text. An empty message is rejected outright, and a
 *      failed turn has nothing worth replaying anyway.
 *   2. Drop leading assistant turns. The array has to open on a user message.
 *   3. Merge consecutive same-role turns rather than dropping either. Both
 *      halves were really said; losing one loses context, and keeping both
 *      separately is the 400.
 *   4. Never end on an assistant turn — the model would have nothing to answer.
 */
export function normalizeTurns(rows: StoredTurn[]): ReplayTurn[] {
  const typed: ReplayTurn[] = [];
  for (const row of rows) {
    const content = (row.content ?? "").trim();
    if (!content) continue;
    const role = row.role === "assistant" ? "assistant" : "user";
    typed.push({ role, content });
  }

  // Open on a user turn.
  let start = 0;
  while (start < typed.length && typed[start].role === "assistant") start++;
  const trimmed = typed.slice(start);

  const merged: ReplayTurn[] = [];
  for (const turn of trimmed) {
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) {
      // Two things the same speaker said with a dead turn between them read as
      // one thing they said. Blank line so they do not run together.
      last.content = `${last.content}\n\n${turn.content}`;
      continue;
    }
    merged.push({ ...turn });
  }

  // A trailing assistant turn leaves nothing to respond to.
  while (merged.length && merged[merged.length - 1].role === "assistant") merged.pop();

  return merged;
}

/** One action a past turn produced, as much of it as the replay needs. */
export interface TurnActionSummary {
  kind?: string | null;
  status?: string | null;
  title?: string | null;
  result?: Record<string, unknown> | null;
}

/** The id a deliverable is findable by, if the action left one behind. */
function idOf(result: Record<string, unknown> | null | undefined): string | null {
  if (!result) return null;
  for (const key of ["proposal_id", "task_id", "client_project_id", "invoice_id", "id"]) {
    const value = result[key];
    if (typeof value === "string" && value) return `${key.replace(/_id$/, "")} ${value}`;
  }
  return null;
}

/**
 * A note describing what a turn produced, appended to the assistant's replayed
 * text.
 *
 * Without this the model has no record that it proposed anything last turn, so
 * it re-proposes work already sitting in the approval queue, or answers a
 * question it already asked. A bare count was not enough: "1 action proposed"
 * does not tell it *which* proposal now exists, so "send me the draft" one turn
 * later got a freshly invented document instead of the one on file. When the
 * actions themselves are known, each is named with its kind, its outcome and
 * the id it left behind.
 */
export function describeTurnOutcome(turn: {
  action_ids?: string[] | null;
  questions?: unknown;
  actions?: TurnActionSummary[] | null;
}): string {
  const notes: string[] = [];
  const detailed = (turn.actions ?? []).filter(Boolean);

  if (detailed.length) {
    for (const a of detailed) {
      const kind = a.kind ?? "action";
      const status = a.status ?? "proposed";
      const ref = idOf(a.result);
      const outcome = status === "executed"
        ? `done${ref ? ` → ${ref}` : ""}`
        : status === "proposed"
        ? "queued, awaiting the owner — it does not exist yet"
        : status;
      notes.push(`[${kind}: ${outcome}${a.title ? ` — "${a.title}"` : ""}]`);
    }
  } else {
    const actions = turn.action_ids?.length ?? 0;
    if (actions) {
      notes.push(`[${actions} action${actions === 1 ? "" : "s"} proposed and awaiting the owner]`);
    }
  }

  if (Array.isArray(turn.questions) && turn.questions.length) {
    notes.push(`[${turn.questions.length} question${turn.questions.length === 1 ? "" : "s"} asked]`);
  }
  return notes.join(" ");
}

