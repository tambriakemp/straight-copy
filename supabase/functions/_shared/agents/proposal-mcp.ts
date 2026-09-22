// The pure parts of the agency-mcp proposal tools, extracted so they can be
// tested without a database — the same reason task-fields.ts exists. No `npm:`
// specifiers here: the frontend test suite imports this module.
import { writtenSections, type ProposalContent } from "./proposal-spine.ts";

/**
 * How the MCP identifies itself in proposal_events.actor. The in-app agents
 * pass their own name here; the MCP is not an agent and has no agents row, so
 * created_by_agent/changed_by_agent stay null and this string is the writer.
 */
export const MCP_PROPOSAL_ACTOR = "agency-mcp";

/**
 * Why a proposal cannot be edited over MCP, or null when it can.
 *
 * Stricter than the in-app agent on purpose. The shared executor only refuses
 * `signed`, so Bree's chat can still amend a proposal she has already sent.
 * The MCP is for Paperclip agents preparing drafts, and a document the client
 * can already see is out of their hands — draft only, everything else is
 * Bree's to change from the portal.
 */
export function editBlockedReason(status: string): string | null {
  if (status === "draft") return null;
  if (status === "signed") return "That proposal is signed. It cannot be rewritten.";
  return `That proposal is '${status}', not a draft. This MCP only edits drafts — ` +
    "changes to anything already sent go through Bree in the portal.";
}

export interface ProposalListRow {
  id: string;
  title: string;
  status: string;
  content: unknown;
  content_version: number | null;
  sent_at: string | null;
  client_id: string;
  client_project_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * One row of list_proposals: the fields a caller needs to pick a proposal,
 * without the content itself — a real proposal runs to ~24,000 characters,
 * which is read_proposal's job to page through.
 */
export function proposalListItem(row: ProposalListRow) {
  const content = (row.content ?? {}) as ProposalContent;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    sections_written: writtenSections(content).length,
    version: row.content_version ?? null,
    sent_at: row.sent_at ?? null,
    client_id: row.client_id,
    client_project_id: row.client_project_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
