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

/**
 * Whether an action may execute without a human looking at it.
 *
 * The single rule the whole autonomy model reduces to: outward-facing work
 * needs a person unless the agent is explicitly fully autonomous.
 */
export function canAutoExecute(autonomy: Autonomy, outward: boolean): boolean {
  if (autonomy === "autonomous") return true;
  if (autonomy === "act_in_app") return !outward;
  return false;
}
