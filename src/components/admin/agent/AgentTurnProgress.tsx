// A turn in flight, with a clock on it.
//
// "she looks like she timed out but i can't tell" — a pending bubble said
// "working on it…" and then said exactly that for as long as you cared to
// watch. Nothing distinguished a turn thinking hard from one whose isolate had
// been killed, so the honest answer to "is it stuck?" was to reload and hope.
//
// A counter that moves is the whole fix. Past the point where the backend
// would have given up, the wording changes rather than the number just growing
// — a turn at 5:12 is not working harder, it is gone.
import { useEffect, useState } from "react";
import AgentSteps, { type AgentStep } from "./AgentSteps";
import { elapsedSince, formatDuration } from "@/lib/duration";

/**
 * The backend's own ceiling: `budgetMs: 240_000` in agent-chat, plus a little
 * room for the write that follows it. Past this a turn is overrunning, not
 * running.
 */
export const TURN_BUDGET_MS = 250_000;

export default function AgentTurnProgress({
  agentName, startedAt, steps,
  onRetry,
}: {
  agentName: string;
  /** ISO timestamp the pending row was created. */
  startedAt: string;
  steps: AgentStep[];
  onRetry: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const ms = elapsedSince(startedAt, now);
  const overrunning = ms > TURN_BUDGET_MS;

  if (overrunning) {
    return (
      <div className="ws__msg-bubble ws__msg-failed">
        <p>
          This one has been going {formatDuration(ms)} — longer than a turn is
          given. It is not coming back. Nothing was lost; send it again.
        </p>
        <button className="ws__msg-retry" onClick={onRetry}>Try again</button>
      </div>
    );
  }

  return (
    <>
      {steps.length > 0 && <AgentSteps steps={steps} live />}
      <div className="ws__msg-bubble ws__msg-bubble--thinking">
        <span>
          {steps.length ? "Working" : `${agentName} is working on it`}
        </span>
        {/* Tabular figures so the seconds do not shuffle the line as they tick. */}
        <span className="ws__turn-clock">{formatDuration(ms)}</span>
      </div>
    </>
  );
}
