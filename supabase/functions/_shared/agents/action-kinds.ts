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
    payload: "{name, client_project_id, due_date?, priority?}",
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
    purpose: "compose a message for a human to review before it sends",
    payload: "{to, subject, body, client_id?}",
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
  draft_proposal: {
    kind: "draft_proposal",
    outward: false,
    purpose:
      "write a proposal into the system as a draft. It is not sent and the client cannot see it until a send_proposal action runs.",
    payload:
      "{client_id, client_project_id, title, content: {cover, sections: [{key, heading, body}]}}",
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
};

/** Whether executing this kind reaches a real person. Unknown kinds are treated as outward. */
export function isOutward(kind: string): boolean {
  return ACTION_KINDS[kind]?.outward ?? true;
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
