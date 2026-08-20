// What an executed action left behind, if anything.
//
// Read from `agent_actions.result` rather than a second table: the action row
// is already the record that the work happened, and another store of the same
// fact would be one more thing to keep in step.
//
// Its own module so AgentDeliverable.tsx exports a component and nothing else.
import type { AgentAction } from "@/lib/agentsApi";

export type Result = {
  proposal_id?: string;
  client_project_id?: string;
  task_id?: string;
  client_id?: string;
  name?: string;
  type?: string;
  link?: string;
};

/**
 * What an executed action left behind, if anything.
 *
 * Read from `agent_actions.result` rather than a separate table: the action row
 * is already the record that the work happened, and a second store of the same
 * fact would be one more thing to keep in step.
 */
export function deliverableOf(action: AgentAction): Result | null {
  if (action.status !== "executed") return null;
  const result = (action.result ?? {}) as Result;
  if (result.proposal_id || result.client_project_id || result.task_id) return result;
  return null;
}
