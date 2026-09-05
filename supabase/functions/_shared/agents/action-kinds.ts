// Every side effect an agent can propose, in one place.
//
// This used to be duplicated three ways: an enum in agent-run's report tool, a
// second enum in agent-chat's reply tool, and a switch in actions.ts. Adding a
// kind meant editing all three and silently getting it wrong in one. Now the
// tool schemas are generated from this table, so a kind the executor doesn't
// know can't be offered to the model in the first place.
//
// `outward` is the only field that carries real risk: it decides whether an
// action can run without a person looking at it (see canAutoExecute in
// types.ts). Anything that reaches a client is outward. No exceptions.

export interface ActionKind {
  kind: string;
  /** True when executing this touches someone outside the business. */
  outward: boolean;
  /**
   * True when executing this destroys something.
   *
   * Separate from `outward` because they fail differently. An outward action
   * embarrasses you in front of a client; a destructive one takes a row away
   * and no autonomy setting should be able to do that unasked. These always
   * wait for a person, even for a fully autonomous agent.
   */
  destructive?: boolean;
  /**
   * True when this always waits for a person, whatever the autonomy.
   *
   * A third category, because the first two do not cover it. This is work that
   * destroys nothing and is not unusual, but where the wording is the whole
   * risk — telling a client their numbers are down, apologising for a post
   * that went wrong. A fully autonomous agent otherwise has no way to write
   * something and ask for it to be read first, and the only alternative is
   * dropping the whole agent back to approving everything.
   */
  alwaysApprove?: boolean;
  /** What this kind does — goes into the tool schema the model sees. */
  purpose: string;
  /** The payload shape, described for the model. */
  payload: string;
}

export const ACTION_KINDS: Record<string, ActionKind> = {
  create_task: {
    kind: "create_task",
    outward: false,
    purpose: "open real work for a person on a client project",
    payload:
      "{name, client_project_id, due_date?, " +
      "priority?: 'low'|'normal'|'high'|'urgent', " +
      "status?: 'backlog'|'ready_for_claude'|'in_progress'|'needs_review'|'blocked'|'complete', " +
      "assignee_kind?: 'unassigned'|'admin'|'claude'|'auto'|'client'|'agency' " +
      "(defaults to claude when status is ready_for_claude, otherwise agency)}",
  },
  // --- board actions ---
  //
  // The developer agent's whole job is judging what is ready and putting it in
  // front of the coding queue in the right order. Until these existed it could
  // only describe doing that, because create_task was the only board action in
  // the table — so a run ended with a paragraph about a task that nobody moved.
  //
  // None of them reach a client and none destroy a row: a status change and a
  // comment are both fully reversible by hand in the UI, which is why they are
  // not outward and not destructive. Moving a task INTO ready_for_claude does
  // start a coding run (trg_fire_queue_on_ready), and that is the point.
  move_task_status: {
    kind: "move_task_status",
    outward: false,
    purpose:
      "move a task to another column on the board. Use ready_for_claude only " +
      "for work that is specified well enough to be built without asking a " +
      "question: it wakes a coding run, and a vague task burns one. Send " +
      "underspecified work back to backlog with a comment saying what is missing.",
    payload:
      "{task_id, status: 'backlog'|'ready_for_claude'|'in_progress'|" +
      "'needs_review'|'blocked'|'complete'}",
  },
  post_task_comment: {
    kind: "post_task_comment",
    outward: false,
    purpose:
      "leave a comment on a task — what is missing before it can be built, " +
      "what you decided, what came back from a run. This is how you talk to " +
      "the owner about one piece of work instead of burying it in a brief.",
    payload: "{task_id, body}",
  },
  add_acceptance_criteria: {
    kind: "add_acceptance_criteria",
    outward: false,
    purpose:
      "append acceptance criteria to a task, so 'done' is a checkable list " +
      "rather than an opinion. The single highest-leverage thing you can do " +
      "to a task before it goes to the coding queue.",
    payload: "{task_id, criteria: string[]}",
  },
  complete_checklist_item: {
    kind: "complete_checklist_item",
    outward: false,
    purpose: "mark a launch checklist item done when the data proves it already is",
    payload: "{item_id}",
  },
  draft_email: {
    kind: "draft_email",
    outward: true,
    purpose:
      "compose a message for a human to review before it sends. " +
      "Always pass client_id when the recipient is a client: it adds a working " +
      "portal button to the email, so a message asking them to review, approve " +
      "or pay gives them the way to do it. Add client_project_id to deep-link " +
      "one project, and portal_link_label to word the button for what you are " +
      "asking ('Review the proposal' beats 'Open your client portal'). " +
      "Never write a portal URL into the body yourself — it is built from the ids.",
    payload:
      "{to, subject, body, client_id?, client_project_id?, portal_link_label?, " +
      "include_portal_link?: boolean (defaults true when client_id is given)}",
  },
  delete_record: {
    kind: "delete_record",
    outward: false,
    destructive: true,
    purpose:
      "delete a record the owner has asked you to remove — test invoices, a duplicate task, a dead proposal. " +
      "Always waits for confirmation, so proposing it is safe. One action per record; say what it is in the title.",
    payload:
      "{table: 'project_invoices'|'project_tasks'|'client_proposals'|'project_links'|'project_notes'|'agent_runs', id, label}",
  },

  flag_risk: {
    kind: "flag_risk",
    outward: false,
    purpose: "raise something needing a human decision; has no side effect",
    payload: "{severity: 'low'|'medium'|'high'}",
  },

  // --- client engagement ---
  sync_client_to_surecontact: {
    kind: "sync_client_to_surecontact",
    outward: false,
    purpose:
      "push a client into SureContact so they exist there as a tagged contact. Safe to repeat — it upserts.",
    payload: "{client_id}",
  },
  create_client_project: {
    kind: "create_client_project",
    outward: false,
    purpose:
      "create the project a proposal will hang off, when the client has none of the right type yet",
    payload:
      "{client_id, name, type: 'automation_build'|'site_preview'|'app_development'|'web_development'|'marketing'}",
  },
  create_proposal_draft: {
    kind: "create_proposal_draft",
    outward: false,
    purpose:
      "start a proposal. Creates an empty draft and returns its id, which you then fill one section at a time with write_proposal_section. Nothing is sent and the client cannot see it.",
    payload: "{client_id, client_project_id, title, kind?, cover?}",
  },
  write_proposal_section: {
    kind: "write_proposal_section",
    outward: false,
    purpose:
      "write ONE section into a proposal draft. Call it once per section, in the order the document should read. Pass an existing heading to replace that section instead of appending. This is how a long proposal gets written — never try to write the whole document in one call.",
    payload:
      "{proposal_id, heading, body, summary?, replace?} — `replace` is OPTIONAL and only for renaming: " +
      "pass the OLD heading as a string to rewrite that section under a new name. To rewrite a section " +
      "and keep its name, just pass its existing `heading` and omit `replace` entirely. Never pass true/false.",
  },
  restore_proposal_version: {
    kind: "restore_proposal_version",
    outward: false,
    purpose:
      "put a proposal back to how it read at an earlier version. Use when Bree says to undo a revision. Omit `version` to step back one.",
    payload: "{proposal_id, version?}",
  },
  send_proposal: {
    kind: "send_proposal",
    outward: true,
    purpose:
      "email the client a link to sign the proposal in their portal, and mark it sent",
    payload: "{proposal_id, subject, body, to?}",
  },
  schedule_followup: {
    kind: "schedule_followup",
    outward: false,
    purpose:
      "set when to next chase an unsigned proposal. Opens a dated task; does not contact anyone.",
    payload: "{proposal_id, due_date, note?}",
  },
  write_social_caption: {
    kind: "write_social_caption",
    outward: false,
    purpose:
      "write the caption and hashtags for a post or photo that has none. " +
      "Nothing leaves the building — a draft nobody sends costs nothing, so " +
      "write rather than ask. Never rewrites something already published.",
    payload:
      "{client_project_id, target: 'post'|'image', id, caption, hashtags: string[]}",
  },
  schedule_social_post: {
    kind: "schedule_social_post",
    outward: true,
    purpose:
      "book a post to go out on the client's social accounts at a given time. " +
      "This is the moment a post becomes real, so say it is booked only once " +
      "you are told it was.",
    payload:
      "{client_project_id, target: 'post'|'image', id, scheduled_at: ISO8601}",
  },
  cancel_social_post: {
    kind: "cancel_social_post",
    outward: false,
    purpose:
      "call off a post that has not gone out yet. Deliberately needs no " +
      "approval — the brake must never wait for one.",
    payload: "{client_project_id, schedule_id, reason?}",
  },
  request_client_setup: {
    kind: "request_client_setup",
    outward: true,
    purpose:
      "email a client who has not finished setting up — the CoPost invite not " +
      "accepted, or no photos in their library yet. One outstanding thing per " +
      "email, and stop once you have asked three times.",
    payload:
      "{client_project_id, client_id, to, subject, body, missing: 'copost'|'photos'}",
  },
  request_client_photos: {
    kind: "request_client_photos",
    outward: true,
    purpose:
      "email the client asking for more photos, naming how many days of " +
      "posting they have left. Routine, so it goes without approval when the " +
      "client is set up for that.",
    payload:
      "{client_project_id, client_id, to, subject, body, days_of_runway?}",
  },
  draft_client_message: {
    kind: "draft_client_message",
    outward: true,
    alwaysApprove: true,
    purpose:
      "write a client email that needs reading before it goes — anything " +
      "about performance, money, scope, or apologising for a post that went " +
      "wrong. Always waits for a person, whatever the autonomy setting.",
    payload:
      "{client_project_id, client_id, to, subject, body, portal_link_label?}",
  },
};

/** Whether executing this kind reaches a real person. Unknown kinds are treated as outward. */
export function isOutward(kind: string): boolean {
  return ACTION_KINDS[kind]?.outward ?? true;
}

/**
 * Whether executing this kind destroys something.
 *
 * A known kind is destructive only if it says so; an unknown one is assumed to
 * be, so a kind added without being classified fails closed rather than
 * silently gaining the right to auto-execute.
 */
export function isDestructive(kind: string): boolean {
  const known = ACTION_KINDS[kind];
  return known ? known.destructive === true : true;
}

/**
 * Whether this kind waits for a person no matter how autonomous the agent is.
 *
 * Unknown kinds always wait, for the same reason isDestructive assumes the
 * worst: a kind added without being classified should fail closed.
 */
export function alwaysApproves(kind: string): boolean {
  const known = ACTION_KINDS[kind];
  return known ? known.alwaysApprove === true : true;
}

/** The `kind` enum for a tool schema, limited to what this agent may propose. */
export function kindEnumFor(allowed: string[]): string[] {
  return allowed.filter((k) => k in ACTION_KINDS);
}

/** Human-readable description of the allowed kinds and their payloads. */
export function kindDocFor(allowed: string[]): string {
  const lines = kindEnumFor(allowed).map((k) => {
    const a = ACTION_KINDS[k];
    return `${a.kind}: ${a.purpose} — payload ${a.payload}`;
  });
  return lines.join("\n");
}
