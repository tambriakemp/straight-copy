// Doing things, from inside the loop.
//
// Actions used to be collected in the terminal reply payload and executed after
// the model had already stopped — so it never saw whether its own work
// succeeded. It could not create a project, read the id back, and attach a
// proposal to it; and when a turn described a draft without proposing it, there
// was nothing to catch the discrepancy.
//
// Now an action is a tool call like any other. Two outcomes, and which one you
// get is decided by canAutoExecute — still the single gate, and still the only
// thing that decides:
//
//   * Permitted → it runs now and the real result comes back, so the next tool
//     call can use the id it just created.
//   * Outward, destructive, or always-approve → it is queued as a proposal and
//     the model is told plainly that nothing happened, so it stops pretending
//     it did.
//
// The one subtlety is WHICH autonomy the gate is asked about. An agent has a
// level of its own, and a client project may override it in either direction,
// so the level passed to the gate is resolved per action from the project named
// in its payload. An action naming no project falls back to the agent's own
// level, which means leaving the field out can never widen anything.
import {
  ACTION_KINDS, alwaysApproves, isDestructive, isOutward, kindDocFor, kindEnumFor,
} from "./action-kinds.ts";
import { canAutoExecute, resolveAutonomy, type Autonomy } from "./types.ts";

/** Actions per turn. Past this it is looping, not working. */
const MAX_ACTIONS = 8;

/** The two inserts this module makes. Declared, not imported — see rules.ts. */
export interface ActionDb {
  from(table: string): {
    insert(row: Record<string, unknown>): {
      select(columns: string): {
        maybeSingle(): PromiseLike<{
          data: Record<string, unknown> & { id: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

export interface ActionToolContext {
  sb: ActionDb;
  agentId: string;
  agentName: string;
  autonomy: Autonomy;
  allowedActions: string[];
  /** Created lazily on the first action — agent_actions.run_id is NOT NULL. */
  runId: string | null;
  conversationId: string | null;
  /** Ids of everything proposed or executed this turn. */
  actionIds: string[];
  /** Guards against a turn that proposes the same thing over and over. */
  taken: Map<string, string>;
  count: { n: number };
  /**
   * Per-project autonomy overrides, keyed by client_project_id.
   *
   * Absent for agents that do not honour them — which is every agent but the
   * social media manager. Absent means the agent's own level decides, exactly
   * as it always has.
   */
  projectAutonomy?: Record<string, string>;
}

export function actionToolDefinition(allowedActions: string[]): Record<string, unknown> {
  return {
    name: "propose_action",
    description:
      "Do something, or put it in front of the owner for approval. " +
      "Anything safe and reversible runs immediately and returns its real result — so create the project, " +
      "read the id back, then use it. Anything that reaches a client or destroys a record is queued instead, " +
      "and you will be told it was queued.\n\n" +
      "Never describe work as done unless a call here came back saying it was done.\n\n" +
      kindDocFor(allowedActions),
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: kindEnumFor(allowedActions) },
        title: { type: "string", description: "Short imperative label naming what and to whom." },
        description: { type: "string", description: "Why, in a sentence." },
        payload: { type: "object", additionalProperties: true, description: "Fields for this kind." },
      },
      required: ["kind", "title", "payload"],
      additionalProperties: false,
    },
  };
}

export async function executeActionTool(
  ctx: ActionToolContext,
  input: Record<string, unknown>,
  // Injected rather than imported so this module stays testable: actions.ts
  // pulls in the Supabase client, the PDF renderer and the mail path.
  execute: (row: Record<string, unknown>) => Promise<{ ok: boolean; result?: unknown; error?: string }>,
): Promise<{ ok: boolean; content: string }> {
  const kind = String(input.kind ?? "");
  const title = String(input.title ?? "").trim();
  const payload = (input.payload ?? {}) as Record<string, unknown>;

  // Refused explicitly rather than dropped. Silently discarding a proposed
  // action wasted the whole turn's reasoning and left the model believing it
  // had acted.
  if (!ctx.allowedActions.includes(kind) || !ACTION_KINDS[kind]) {
    return {
      ok: false,
      content: `You cannot do "${kind}". What you can do: ${ctx.allowedActions.join(", ")}.`,
    };
  }
  if (!title) return { ok: false, content: "Every action needs a title saying what it does." };

  if (ctx.count.n >= MAX_ACTIONS) {
    return { ok: false, content: `That is ${MAX_ACTIONS} actions in one turn, which is the limit. Finish and report.` };
  }

  // The same action twice in a turn is a retry loop, not two pieces of work.
  const fingerprint = `${kind}:${JSON.stringify(payload)}`;
  const already = ctx.taken.get(fingerprint);
  if (already) {
    return { ok: true, content: JSON.stringify({ action_id: already, note: "You already did this one this turn." }) };
  }

  if (!ctx.runId) {
    const { data: run } = await ctx.sb.from("agent_runs").insert({
      agent_id: ctx.agentId,
      status: "succeeded",
      trigger: "chat",
      conversation_id: ctx.conversationId,
      started_at: new Date().toISOString(),
    }).select("id").maybeSingle();
    ctx.runId = run?.id ?? null;
    if (!ctx.runId) return { ok: false, content: "Could not open a run to record that against." };
  }

  const outward = isOutward(kind);
  const destructive = isDestructive(kind);

  // The autonomy that applies to THIS piece of work, which is not always the
  // agent's own. A client project can widen or narrow it.
  //
  // Note what happens when the payload carries no client_project_id: the
  // lookup misses, resolveAutonomy falls back to the agent's level, and the
  // action is gated exactly as it would have been. An agent cannot widen
  // itself by leaving the field out.
  const projectId = String(payload.client_project_id ?? "");
  const effective = resolveAutonomy(ctx.autonomy, ctx.projectAutonomy?.[projectId]);
  const auto = canAutoExecute(effective, outward, destructive, alwaysApproves(kind));

  const { data: row, error } = await ctx.sb.from("agent_actions").insert({
    run_id: ctx.runId,
    agent_id: ctx.agentId,
    kind,
    outward,
    title,
    description: input.description ?? null,
    payload,
    status: auto ? "approved" : "proposed",
  }).select("*").maybeSingle();

  if (error || !row) {
    return { ok: false, content: `Could not record that action: ${error?.message ?? "unknown"}` };
  }

  ctx.count.n += 1;
  ctx.actionIds.push(row.id);
  ctx.taken.set(fingerprint, row.id);

  if (!auto) {
    return {
      ok: true,
      content: JSON.stringify({
        action_id: row.id,
        status: "awaiting_approval",
        reason: destructive
          ? "this destroys a record"
          : alwaysApproves(kind)
          ? "this always gets read before it goes"
          : "this reaches a person",
        note:
          "NOTHING HAS HAPPENED YET. It is waiting for the owner to approve it. " +
          "Do not say it is done, and do not use an id you were not given.",
      }),
    };
  }

  const outcome = await execute(row);
  if (!outcome.ok) {
    return {
      ok: false,
      content: JSON.stringify({
        action_id: row.id,
        status: "failed",
        error: outcome.error,
        note: "This did not work. Fix the problem and try again, or say what is blocking it.",
      }),
    };
  }

  // The real result, so the next call can use what this one created.
  return {
    ok: true,
    content: JSON.stringify({ action_id: row.id, status: "done", result: outcome.result ?? null }),
  };
}
