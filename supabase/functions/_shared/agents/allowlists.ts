// What each agent is allowed to do.
//
// These used to live inline in registry.ts next to each mission, and an edit to
// one mission silently deleted its allowlist — which made `def.allowedActions`
// undefined and took down every turn for that agent. Policy and prose have
// different failure modes, so they now live apart: this file is pure data with
// no imports beyond the kind table, which means a test can check that every
// agent has a list and every kind in it actually exists.
import { ACTION_KINDS } from "./action-kinds.ts";

/**
 * The board, in full, for everyone.
 *
 * It used to belong to the developer agent alone. That looked tidy and was
 * wrong in practice: the board is where ALL the agency's work lives, so every
 * other agent could see a task was mis-specified, misfiled or finished and
 * could do exactly one thing about it — open a second task saying so. Boards
 * fill up with near-duplicates that way, and the one thing an agent noticed is
 * the thing nobody actions.
 *
 * Every kind here is internal and reversible by hand in the UI, which is what
 * makes handing them out safe: none reaches a client, none destroys a row.
 * Deleting a task is NOT in this list — that is `delete_record`, which is
 * destructive and waits for a person however autonomous the agent is.
 *
 * One of them does spend money. Moving a task into `ready_for_claude` wakes a
 * coding run (trg_fire_queue_on_ready), and that is now a lever six agents
 * hold rather than one. The purpose text on move_task_status and update_task
 * says so; the guard is that text plus the autonomy setting, not the allowlist.
 */
const BOARD = [
  "create_task",
  "update_task",
  "move_task_status",
  "post_task_comment",
  "add_acceptance_criteria",
  "update_acceptance_criteria",
];

export const ALLOWED_ACTIONS: Record<string, string[]> = {
  "revenue-analyst": [...BOARD, "flag_risk", "delete_record"],
  "launch-ops": [
    ...BOARD,
    "complete_checklist_item",
    "draft_email",
    "flag_risk",
    "delete_record",
  ],
  // Onboarding, not just chasing. Asked to take on the client you just got off
  // the phone with, this used to be able to open a task reminding you to do it
  // by hand. Both kinds are internal writes to our own tables, so an
  // act_in_app agent completes the job inside the conversation.
  "client-triage": [
    ...BOARD,
    "create_client",
    "create_client_project",
    "draft_email",
    "flag_risk",
    "delete_record",
  ],
  developer: [...BOARD, "flag_risk", "delete_record"],
  "social-media": [
    ...BOARD,
    "write_social_caption",
    "schedule_social_post",
    "cancel_social_post",
    "request_client_photos",
    "request_client_setup",
    "draft_client_message",
    "flag_risk",
    "delete_record",
  ],
  "client-engagement": [
    ...BOARD,
    "sync_client_to_surecontact",
    // It already created the project a proposal hangs off but could not create
    // the client it hangs off, so a brand new prospect meant leaving the chat.
    "create_client",
    "create_client_project",
    "create_proposal_draft",
    "write_proposal_section",
    "restore_proposal_version",
    "send_proposal",
    "schedule_followup",
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
