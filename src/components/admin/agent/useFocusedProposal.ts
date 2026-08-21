// Which proposal the conversation is about.
//
// "Make the second installment smaller" has to resolve to a specific document,
// and a conversation may touch several. The panel and the agent must agree on
// which one, or Bree reads one proposal while Bria edits another.
//
// Resolution, most explicit first:
//   1. ?proposal= in the URL — she clicked through from somewhere specific.
//   2. The most recently touched unsigned draft this agent has worked on.
//
// Deliberately narrow: a signed proposal is finished and is not the subject of
// a revision, so it never becomes the focus by accident.
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { ProposalContent } from "../../../../supabase/functions/_shared/agents/proposal-spine";

export interface FocusedProposal {
  id: string;
  title: string;
  status: string;
  content: ProposalContent | null;
  content_version: number;
  updated_at: string;
  client_id: string;
  source_pdf_path: string | null;
}

export function useFocusedProposal(agentId: string, nonce = 0) {
  const [proposal, setProposal] = useState<FocusedProposal | null>(null);
  const [loading, setLoading] = useState(true);
  // Through the router rather than window.location: reading the URL once on
  // mount meant clicking a proposal in the chat left the panel showing whatever
  // it had already resolved to, which is the mismatch Bree hit — reading one
  // document while the agent edited another.
  const [params, setParams] = useSearchParams();
  const explicit = params.get("proposal");

  const load = useCallback(async () => {

    let q = supabase
      .from("client_proposals")
      .select("id, title, status, content, content_version, updated_at, client_id, source_pdf_path");

    if (explicit) {
      q = q.eq("id", explicit);
    } else {
      // A signed proposal is done; drafts and sent ones can still be revised.
      q = q.eq("created_by_agent", agentId)
        .neq("status", "signed")
        .order("updated_at", { ascending: false })
        .limit(1);
    }

    const { data } = await q;
    const row = (data ?? [])[0];
    setProposal(
      row
        ? { ...row, content: (row.content as ProposalContent | null) ?? null }
        : null,
    );
    setLoading(false);
  }, [agentId, explicit]);

  useEffect(() => { void load(); }, [load, nonce]);

  /** Pin the panel to one proposal. Clicking a different one re-pins. */
  const focus = useCallback((id: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("proposal", id);
      return next;
    }, { replace: true });
  }, [setParams]);

  /** Unpin, so the panel follows whatever the agent touched last again. */
  const followLatest = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("proposal");
      return next;
    }, { replace: true });
  }, [setParams]);

  // The agent writes a section at a time, so the panel has to follow along.
  //
  // Subscribing to the row rather than streaming it: client_proposals.content
  // is a large jsonb column on a REPLICA IDENTITY FULL table, so every UPDATE
  // already broadcasts the whole document. Re-fetching one row on notice costs
  // far less than parsing a 24,000-character payload out of every event, and it
  // keeps the panel honest about what is actually stored.
  useEffect(() => {
    if (!proposal?.id) return;
    const channel = supabase
      .channel(`proposal-${proposal.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "client_proposals", filter: `id=eq.${proposal.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [proposal?.id, load]);

  return { proposal, loading, reload: load, focus, followLatest, pinned: Boolean(explicit) };
}
