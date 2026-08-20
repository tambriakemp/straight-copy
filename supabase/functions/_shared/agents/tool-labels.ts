// The human sentence shown while a tool runs.
//
// "Searching clients for Menovia" is what makes a two-minute turn feel like
// work happening rather than a hang. Kept here, import-free and tested, so the
// UI never has to reconstruct phrasing from raw tool arguments — and so the
// wording is reviewable in one place.

const ENTITY_PLURAL: Record<string, string> = {
  client: "clients",
  contact: "contacts",
  project: "projects",
  proposal: "proposals",
  contract: "contracts",
  invoice: "invoices",
  task: "tasks",
  venture: "ventures",
  launch: "launches",
  preview: "previews",
  wiki: "the wiki",
};

const TABLE_NOUN: Record<string, string> = {
  clients: "clients",
  client_contacts: "contacts",
  client_projects: "projects",
  client_proposals: "proposals",
  client_contracts: "contracts",
  project_invoices: "invoices",
  project_tasks: "tasks",
  project_task_comments: "task comments",
  project_notes: "project notes",
  project_links: "project links",
  proposal_events: "proposal activity",
  ventures: "ventures",
  venture_launches: "launches",
  launch_checklist_items: "launch checklist items",
  revenue_entries: "revenue entries",
  metric_snapshots: "metric snapshots",
  funnel_events: "funnel events",
  wiki_documents: "wiki documents",
  activity_events: "activity",
  email_send_log: "the email log",
  surecontact_events: "SureContact activity",
  agent_runs: "agent runs",
  agent_actions: "agent actions",
  agent_rules: "rules",
  revenue_ledger_v: "the revenue ledger",
};

const ACTION_VERB: Record<string, string> = {
  create_task: "Opening a task",
  complete_checklist_item: "Ticking a checklist item",
  draft_email: "Drafting an email",
  delete_record: "Proposing a deletion",
  flag_risk: "Flagging a risk",
  sync_client_to_surecontact: "Syncing to SureContact",
  create_client_project: "Creating a project",
  draft_proposal: "Writing the proposal",
  send_proposal: "Preparing to send the proposal",
  schedule_followup: "Scheduling a follow-up",
};

const quote = (s: unknown) => `“${String(s ?? "").slice(0, 60)}”`;

/** One line describing a tool call, in the present continuous. */
export function stepLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "search": {
      const where = ENTITY_PLURAL[String(input.entity)] ?? String(input.entity ?? "records");
      return `Searching ${where} for ${quote(input.q)}`;
    }
    case "query": {
      const noun = TABLE_NOUN[String(input.table)] ?? String(input.table ?? "records").replace(/_/g, " ");
      return input.count_only ? `Counting ${noun}` : `Looking through ${noun}`;
    }
    case "get_record": {
      const noun = TABLE_NOUN[String(input.table)] ?? String(input.table ?? "record").replace(/_/g, " ");
      // Singularise crudely — good enough for a progress line, and it reads
      // better than "Reading clients" when fetching exactly one.
      return `Reading a ${noun.replace(/ies$/, "y").replace(/s$/, "")}`;
    }
    case "propose_action": {
      const verb = ACTION_VERB[String(input.kind)] ?? "Proposing an action";
      return input.title ? `${verb}: ${String(input.title).slice(0, 70)}` : verb;
    }
    case "web_search":
      return `Searching the web for ${quote(input.query)}`;
    case "ask":
      return "Asking you something";
    case "reply":
      return "Writing the answer";
    default:
      return `Running ${name.replace(/_/g, " ")}`;
  }
}

/** A short past-tense summary once a call has returned. */
export function resultLabel(
  name: string,
  outcome: { ok: boolean; count?: number; note?: string },
): string {
  if (!outcome.ok) return outcome.note ?? "That did not work";
  if (typeof outcome.count === "number") {
    if (outcome.count === 0) return "Nothing matched";
    return `${outcome.count} result${outcome.count === 1 ? "" : "s"}`;
  }
  if (name === "get_record") return "Read it";
  return outcome.note ?? "Done";
}
