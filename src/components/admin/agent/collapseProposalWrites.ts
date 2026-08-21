// Collapsing a proposal's many section writes into one card.
//
// Its own module so AgentActionCards.tsx exports a component and nothing else,
// which is what keeps fast refresh working — the same split already applied to
// useAgentSteps.ts and deliverable.ts.
import type { AgentAction } from "@/lib/agentsApi";

/**
 * One document, one card.
 *
 * A proposal is written a section at a time, so an eleven-section draft
 * produced eleven near-identical cards in the chat — "Write section 01",
 * "Write section 02" — each with its own Read and PDF buttons pointing at the
 * same document. The chat became a build log for something the panel beside it
 * was already showing.
 *
 * Collapse every write against one proposal into the card for that proposal,
 * keeping the earliest position so the document does not jump to the bottom of
 * the thread each time a section lands. Writes against DIFFERENT proposals stay
 * separate, because those are genuinely different documents.
 */
export function collapseProposalWrites(actions: AgentAction[]): AgentAction[] {
  const PROPOSAL_KINDS = new Set([
    "create_proposal_draft", "write_proposal_section", "restore_proposal_version",
  ]);
  const out: AgentAction[] = [];
  const indexByProposal = new Map<string, number>();

  for (const a of actions) {
    const proposalId = (a.result as { proposal_id?: string } | null)?.proposal_id;
    if (!PROPOSAL_KINDS.has(a.kind) || !proposalId) {
      out.push(a);
      continue;
    }
    const at = indexByProposal.get(proposalId);
    if (at === undefined) {
      indexByProposal.set(proposalId, out.length);
      out.push(a);
      continue;
    }
    // Keep the latest state — a later write knows the real section count — but
    // hold the position the document first appeared at.
    out[at] = a;
  }
  return out;
}
