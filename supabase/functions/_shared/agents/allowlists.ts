// What each agent is allowed to do.
//
// These used to live inline in registry.ts next to each mission, and an edit to
// one mission silently deleted its allowlist — which made `def.allowedActions`
// undefined and took down every turn for that agent. Policy and prose have
// different failure modes, so they now live apart: this file is pure data with
// no imports beyond the kind table, which means a test can check that every
// agent has a list and every kind in it actually exists.
import { ACTION_KINDS } from "./action-kinds.ts";

export const ALLOWED_ACTIONS: Record<string, string[]> = {
  "revenue-analyst": ["flag_risk", "delete_record"],
  "launch-ops": [
    "create_task",
    "complete_checklist_item",
    "draft_email",
    "flag_risk",
    "delete_record",
  ],
  "client-triage": ["create_task", "draft_email", "flag_risk", "delete_record"],
  // The board actions are what make this one an agent rather than a
  // commentator: without them it can judge a task's readiness and then do
  // nothing about it. move_task_status is also the only way anything reaches
  // the coding queue, since trg_fire_queue_on_ready fires on the transition
  // into ready_for_claude.
  developer: [
    "create_task",
    "move_task_status",
    "post_task_comment",
    "add_acceptance_criteria",
    "flag_risk",
    "delete_record",
  ],
  "social-media": [
    "write_social_caption",
    "schedule_social_post",
    "cancel_social_post",
    "request_client_photos",
    "request_client_setup",
    "draft_client_message",
    "create_task",
    "flag_risk",
    "delete_record",
  ],
  "client-engagement": [
    "sync_client_to_surecontact",
    "create_client_project",
    "create_proposal_draft",
    "write_proposal_section",
    "restore_proposal_version",
    "send_proposal",
    "schedule_followup",
    "create_task",
    "draft_email",
    "flag_risk",
    "delete_record",
  ],
};

/**
 * The allowlist for an agent, filtered to kinds that actually have an executor.
 *
 * Falls back to an empty list rather than undefined: an agent with no known
 * actions should propose nothing, not throw on the way to proposing nothing.
 */
export function allowedFor(key: string): string[] {
  return (ALLOWED_ACTIONS[key] ?? []).filter((k) => k in ACTION_KINDS);
}
