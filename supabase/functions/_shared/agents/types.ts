// Shared types for the agent runtime.

export type Autonomy = "propose" | "act_in_app" | "autonomous";

export interface AgentRow {
  id: string;
  key: string;
  name: string;
  role: string;
  description: string | null;
  enabled: boolean;
  autonomy: Autonomy;
  model: string;
  effort: string;
  system_prompt: string | null;
  schedule_cron: string | null;
  delivery: Record<string, boolean>;
  config: Record<string, unknown>;
}

/** A side effect the agent wants. Always written to agent_actions first. */
export interface ProposedAction {
  kind: string;
  /** Reaches a real person (email, client-facing message). Gated harder. */
  outward: boolean;
  title: string;
  description?: string;
  payload: Record<string, unknown>;
}

export interface AgentFinding {
  headline: string;
  summary: string;
  detail: Record<string, unknown>;
  actions: ProposedAction[];
}

const LEVELS = new Set<Autonomy>(["propose", "act_in_app", "autonomous"]);

/**
 * The autonomy that actually applies to one piece of work.
 *
 * The agent row is the default; a client project may override it in either
 * direction, which is the point — a new client stays approval-gated while a
 * trusted one posts unattended, under the same agent.
 *
 * One exception, and it is the brake: an agent set to `propose` cannot be
 * widened by any project. `propose` is the setting you reach for when you want
 * an agent to stop touching things, and a per-project grant that survived it
 * would make that setting a lie.
 *
 * Anything unrecognised falls back to the agent's own level. It never widens.
 */
export function resolveAutonomy(
  agent: Autonomy,
  project?: string | null,
): Autonomy {
  if (!project || !LEVELS.has(project as Autonomy)) return agent;
  if (agent === "propose") return "propose";
  return project as Autonomy;
}

/**
 * Whether an action may execute without a human looking at it.
 *
 * Three rules, and only the first is negotiable:
 *   * Outward work — anything reaching a person — needs approval unless the
 *     agent is explicitly fully autonomous.
 *   * Destructive work always needs approval. An autonomous agent can send an
 *     email you would not have sent, and you can apologise. It cannot un-delete
 *     an invoice.
 *   * A kind marked `alwaysApprove` always needs approval, whatever the
 *     autonomy. That is for work which is not destructive and not unusual, but
 *     where the wording is the whole risk — telling a client their numbers are
 *     down, or apologising for a post that went wrong. Without it, a fully
 *     autonomous agent has no way to say "I wrote this, but read it first".
 *
 * `autonomy` here is the EFFECTIVE level. Callers that honour per-project
 * overrides must pass it through `resolveAutonomy` above first; the two live
 * side by side so nobody reaches for one without seeing the other.
 */
export function canAutoExecute(
  autonomy: Autonomy,
  outward: boolean,
  destructive = false,
  alwaysApprove = false,
): boolean {
  if (destructive || alwaysApprove) return false;
  if (autonomy === "autonomous") return true;
  if (autonomy === "act_in_app") return !outward;
  return false;
}
