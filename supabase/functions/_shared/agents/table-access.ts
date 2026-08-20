// What an agent is allowed to read.
//
// This is the security boundary. Agent tools run with the service role, which
// bypasses RLS entirely, so nothing below this file stops an agent reading a
// table — the allowlist here is the whole of it.
//
// It is fail-closed by construction: a table is readable only if it appears in
// READABLE, and a column only if it appears in that table's list. A table added
// to the database is unreadable until someone adds it here on purpose, which is
// the right default for a list that governs access.
//
// Import-free, so it can be unit-tested from the frontend test suite. Given
// what it governs, that matters more here than anywhere else in the codebase.

export interface TableAccess {
  /** Friendly singular name, used by the `search` tool. */
  entity?: string;
  /** Explicit projection. `select("*")` is never possible. */
  columns: string[];
  /** Columns `search` runs a case-insensitive match over. */
  searchable?: string[];
  /** Columns that can hold a lot of text — truncated in lists, full in reads. */
  long?: string[];
  /** Columns permitted in a filter. Defaults to `columns` when absent. */
  filterable?: string[];
  /** Hard ceiling on rows per query, whatever the model asks for. */
  maxLimit: number;
}

/**
 * Never returned, even if a table lists them.
 *
 * A second line of defence: a column added to a table's list by mistake, or a
 * new credential column landing in an existing table, is still withheld.
 *
 * The key patterns are enumerated rather than matching `_key` wholesale —
 * `metric_key`, `event_key` and `agents.key` are ordinary data an agent needs,
 * while `public_ingest_key` is a credential that grants funnel writes.
 */
export const FORBIDDEN_COLUMN =
  /token|secret|password|_hash|^pin$|signature_data|(?:api|ingest|access|private|signing|webhook)_key/i;

export const READABLE: Record<string, TableAccess> = {
  clients: {
    entity: "client",
    columns: [
      "id", "business_name", "contact_name", "contact_email", "contact_phone",
      "pipeline_stage", "tier", "status", "notes", "intake_summary",
      "surecontact_contact_uuid", "purchased_at", "delivery_date",
      "build_start_date", "archived", "created_at", "updated_at",
    ],
    searchable: ["business_name", "contact_name", "contact_email"],
    long: ["notes", "intake_summary"],
    maxLimit: 50,
  },
  client_contacts: {
    entity: "contact",
    columns: ["id", "client_id", "name", "email", "phone", "role", "created_at"],
    searchable: ["name", "email", "role"],
    maxLimit: 50,
  },
  client_projects: {
    entity: "project",
    columns: [
      "id", "client_id", "name", "type", "status", "notes",
      "repo_url", "repo_branch", "deploy_provider", "deploy_project_name",
      "toolchain", "queue_enabled", "build_notes", "created_at", "updated_at",
    ],
    searchable: ["name", "type"],
    long: ["notes", "build_notes"],
    maxLimit: 50,
  },
  client_proposals: {
    entity: "proposal",
    columns: [
      "id", "client_id", "client_project_id", "title", "description", "status",
      "content", "sent_at", "sent_to", "first_opened_at", "first_viewed_at",
      "last_activity_at", "next_followup_at", "followup_count",
      "client_signature_name", "client_signed_at", "agency_countersigned_at",
      "source_pdf_path", "created_at", "updated_at",
    ],
    searchable: ["title", "description"],
    long: ["content", "description"],
    maxLimit: 25,
  },
  proposal_events: {
    columns: ["id", "proposal_id", "client_id", "event_type", "actor", "occurred_at", "detail"],
    maxLimit: 50,
  },
  client_contracts: {
    entity: "contract",
    columns: [
      "id", "client_id", "title", "status", "signed_at", "created_at", "updated_at",
    ],
    searchable: ["title"],
    maxLimit: 25,
  },
  project_invoices: {
    entity: "invoice",
    columns: [
      "id", "client_id", "client_project_id", "label", "amount_cents", "currency",
      "status", "due_date", "sent_at", "paid_at", "created_at",
    ],
    searchable: ["label"],
    maxLimit: 50,
  },
  project_tasks: {
    entity: "task",
    columns: [
      "id", "client_project_id", "epic_id", "name", "description",
      "acceptance_criteria", "status", "priority", "size", "assignee_kind",
      "due_date", "blocked_by", "tags", "url", "design_url",
      "claimed_by", "claimed_at", "created_at", "updated_at",
    ],
    searchable: ["name", "description"],
    long: ["description", "acceptance_criteria"],
    maxLimit: 50,
  },
  project_task_comments: {
    columns: ["id", "task_id", "author", "body", "created_at"],
    searchable: ["body"],
    long: ["body"],
    maxLimit: 50,
  },
  project_task_epics: {
    columns: ["id", "client_project_id", "name", "order_index", "created_at"],
    searchable: ["name"],
    maxLimit: 50,
  },
  project_notes: {
    columns: ["id", "client_project_id", "body", "created_at", "updated_at"],
    searchable: ["body"],
    long: ["body"],
    maxLimit: 50,
  },
  project_links: {
    columns: ["id", "client_project_id", "label", "url", "created_at"],
    searchable: ["label", "url"],
    maxLimit: 50,
  },
  project_progress_reports: {
    columns: ["id", "client_project_id", "summary", "period_start", "period_end", "created_at"],
    searchable: ["summary"],
    long: ["summary"],
    maxLimit: 25,
  },
  ventures: {
    entity: "venture",
    columns: [
      "id", "slug", "name", "kind", "status", "currency", "description",
      "platform", "goal_mrr_cents", "goal_members", "created_at",
    ],
    searchable: ["name", "slug", "description"],
    maxLimit: 50,
  },
  venture_launches: {
    entity: "launch",
    columns: [
      "id", "venture_id", "name", "slug", "status", "cart_open_at", "cart_close_at",
      "starts_at", "ends_at", "ticket_price_cents", "goal_revenue_cents",
      "goal_signups", "notes", "created_at",
    ],
    searchable: ["name", "slug"],
    long: ["notes"],
    maxLimit: 50,
  },
  launch_checklist_items: {
    columns: ["id", "launch_id", "key", "label", "status", "order_index", "completed_at"],
    searchable: ["label"],
    maxLimit: 50,
  },
  revenue_entries: {
    columns: [
      "id", "venture_id", "launch_id", "occurred_at", "amount_cents", "currency",
      "kind", "source", "customer_email", "customer_name", "description",
    ],
    searchable: ["description", "customer_name"],
    maxLimit: 50,
  },
  metric_snapshots: {
    columns: ["id", "venture_id", "captured_on", "metric_key", "value", "source", "notes"],
    maxLimit: 50,
  },
  funnel_events: {
    columns: ["id", "venture_id", "launch_id", "stage", "occurred_at", "source", "utm"],
    maxLimit: 50,
  },
  wiki_documents: {
    entity: "wiki",
    columns: [
      "id", "folder_id", "title", "slug", "status", "content", "created_at", "updated_at",
    ],
    searchable: ["title", "content"],
    long: ["content"],
    maxLimit: 25,
  },
  wiki_folders: {
    columns: ["id", "parent_id", "name", "created_at"],
    searchable: ["name"],
    maxLimit: 50,
  },
  preview_projects: {
    entity: "preview",
    columns: ["id", "client_id", "name", "status", "created_at", "updated_at"],
    searchable: ["name"],
    maxLimit: 50,
  },
  activity_events: {
    columns: ["id", "kind", "actor", "summary", "client_id", "created_at"],
    searchable: ["summary"],
    maxLimit: 50,
  },
  email_send_log: {
    columns: ["id", "message_id", "template_name", "recipient_email", "status", "error_message", "created_at"],
    searchable: ["recipient_email", "template_name"],
    maxLimit: 50,
  },
  surecontact_events: {
    columns: [
      "id", "event_type", "recipient_email", "campaign_name", "client_id",
      "proposal_id", "url", "occurred_at",
    ],
    maxLimit: 50,
  },
  agents: {
    columns: ["id", "key", "name", "role", "description", "enabled", "autonomy", "schedule_cron", "last_run_at"],
    searchable: ["name", "role", "key"],
    maxLimit: 25,
  },
  agent_runs: {
    columns: ["id", "agent_id", "status", "trigger", "headline", "summary", "started_at", "finished_at"],
    searchable: ["headline", "summary"],
    long: ["summary"],
    maxLimit: 25,
  },
  agent_actions: {
    columns: ["id", "run_id", "agent_id", "kind", "outward", "title", "description", "status", "error", "created_at"],
    searchable: ["title", "description"],
    maxLimit: 50,
  },
  agent_rules: {
    columns: ["id", "agent_id", "scope", "label", "body", "category", "enabled", "order_index"],
    searchable: ["label", "body"],
    maxLimit: 50,
  },
  revenue_ledger_v: {
    columns: ["stream", "venture_id", "launch_id", "client_id", "occurred_at", "amount_cents", "currency", "kind"],
    maxLimit: 50,
  },
  latest_metric_snapshots_v: {
    columns: ["venture_id", "metric_key", "value", "captured_on"],
    maxLimit: 50,
  },
};

/**
 * Tables an agent must never read, listed for the reader rather than the code —
 * exclusion is by absence from READABLE above, not by this list.
 *
 * admin_users, api_tokens, mcp_oauth_* — auth.
 * project_secrets, push_subscriptions, email_unsubscribe_tokens — credentials.
 * agent_conversations, agent_messages — other people's threads; a context bomb
 *   and a privacy surprise even for an agent reading its own.
 * preview_files, project_task_attachments — blobs.
 */
export const NEVER_READABLE = [
  "admin_users", "api_tokens", "mcp_oauth_clients", "mcp_oauth_codes",
  "mcp_oauth_tokens", "project_secrets", "push_subscriptions",
  "email_unsubscribe_tokens", "suppressed_emails", "app_settings",
  "agent_conversations", "agent_messages", "agent_message_steps",
  "preview_files", "project_task_attachments", "wiki_user_roles",
] as const;

export type FilterOp =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte"
  | "like" | "ilike" | "in" | "is_null" | "not_null";

export const FILTER_OPS: FilterOp[] = [
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is_null", "not_null",
];

export function isReadable(table: string): boolean {
  return Object.prototype.hasOwnProperty.call(READABLE, table);
}

/** The columns a query may actually return. Never includes a forbidden one. */
export function projectionFor(table: string, requested?: string[]): string[] {
  const access = READABLE[table];
  if (!access) return [];
  const allowed = access.columns.filter((c) => !FORBIDDEN_COLUMN.test(c));
  if (!requested?.length) return allowed;
  const wanted = requested.filter((c) => allowed.includes(c));
  // An empty intersection means every column asked for was denied. Returning
  // the full projection then would hand over exactly what was refused, so fall
  // back to the id alone.
  return wanted.length ? wanted : allowed.filter((c) => c === "id");
}

/** Whether a column may be filtered on. */
export function isFilterable(table: string, column: string): boolean {
  const access = READABLE[table];
  if (!access) return false;
  if (FORBIDDEN_COLUMN.test(column)) return false;
  const list = access.filterable ?? access.columns;
  return list.includes(column);
}

/** Rows to return: what was asked for, clamped to what the table permits. */
export function clampLimit(table: string, requested?: number): number {
  const max = READABLE[table]?.maxLimit ?? 20;
  if (!requested || requested < 1) return Math.min(20, max);
  return Math.min(Math.floor(requested), max);
}

/** Map a friendly entity name back to its table. */
export function tableForEntity(entity: string): string | null {
  const found = Object.entries(READABLE).find(([, a]) => a.entity === entity);
  return found ? found[0] : null;
}

/** Every entity name `search` accepts. */
export function searchableEntities(): string[] {
  return Object.values(READABLE)
    .map((a) => a.entity)
    .filter((e): e is string => !!e)
    .sort();
}
