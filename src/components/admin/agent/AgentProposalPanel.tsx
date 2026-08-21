// The proposal, beside the chat.
//
// Bree: "she will be doing all revising. this needs to work no different than
// how i communicate with you and ask you to do things." So this is a VIEWER.
// No cursor, no save button, no inline editing. She reads it here and tells
// Bria what to change.
//
// The rule this depends on, which must not be traded away for convenience:
// THE DOCUMENT DOES NOT LIVE IN THE CONVERSATION. It is a row rendered in a
// panel, never pasted into a chat message. Otherwise ~6,000 tokens re-enter
// context every turn, the thread becomes unreadable, and there is no single
// source of truth — just N copies at varying correctness.
//
// It renders through the same renderProposalHtml the PDF path uses, so what she
// reads here is what the client will read.
import { useMemo } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  renderProposalHtml,
  reviewProposal,
  writtenSections,
} from "../../../../supabase/functions/_shared/agents/proposal-spine";
import type { FocusedProposal } from "./useFocusedProposal";

async function download(proposal: FocusedProposal) {
  if (!proposal.source_pdf_path) return;
  const { data } = await supabase.storage
    .from("client-assets")
    .createSignedUrl(proposal.source_pdf_path, 60 * 60);
  if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

export default function AgentProposalPanel({
  proposal, loading, agentName, pinned = false, onFollowLatest,
}: {
  proposal: FocusedProposal | null;
  loading: boolean;
  agentName: string;
  /** True when the panel is held on one proposal rather than following. */
  pinned?: boolean;
  onFollowLatest?: () => void;
}) {
  const html = useMemo(
    () => (proposal?.content ? renderProposalHtml(proposal.title, proposal.content) : ""),
    [proposal?.content, proposal?.title],
  );
  const review = useMemo(
    () => (proposal?.content ? reviewProposal(proposal.content) : null),
    [proposal?.content],
  );
  const sections = proposal?.content ? writtenSections(proposal.content).length : 0;

  if (loading) {
    return (
      <div className="ws__doc ws__doc--empty">
        <Loader2 size={16} className="ws__doc-spin" />
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="ws__doc ws__doc--empty">
        <FileText size={20} />
        <p>No proposal in focus.</p>
        <p className="ws__doc-hint">
          Ask {agentName} to draft one and it will appear here as she writes it.
        </p>
      </div>
    );
  }

  // A draft mid-write is the normal case, not an error — she watches it fill in.
  if (!sections) {
    return (
      <div className="ws__doc ws__doc--empty">
        <FileText size={20} />
        <p>{proposal.title}</p>
        <p className="ws__doc-hint">Started, but nothing written yet.</p>
      </div>
    );
  }

  return (
    <div className="ws__doc ws__doc--pinnable">
      <header className="ws__doc-head">
        <div>
          <p className="ws__doc-title">{proposal.title}</p>
          <p className="ws__doc-meta">
            {proposal.status} · {sections} section{sections === 1 ? "" : "s"} ·
            {" "}v{proposal.content_version}
          </p>
        </div>
        {/* The PDF is rendered at send time, not on every section write — so a
            draft mid-revision genuinely has nothing to download yet, and the
            control says so rather than handing over a stale file. */}
        {proposal.source_pdf_path ? (
          <button className="ws__doc-dl" onClick={() => void download(proposal)}>
            <Download size={13} /> PDF
          </button>
        ) : (
          <span className="ws__doc-dl ws__doc-dl--none" title="The PDF is generated when the proposal is sent.">
            no PDF yet
          </span>
        )}
      </header>

      {/* Pinning is invisible otherwise, and an unexplained stale panel is
          worse than no panel — say which mode this is in and offer the way
          back. Unpinned, it follows whatever the agent touched last. */}
      {pinned && onFollowLatest && (
        <p className="ws__doc-pin">
          Showing the proposal you picked.
          <button className="ws__doc-pin-btn" onClick={onFollowLatest}>Follow the latest</button>
        </p>
      )}

      {/* What is outstanding, from the same non-blocking review the agent sees.
          Reported, never enforced — the point is that she knows before she
          sends, not that anything is prevented. */}
      {review?.missing.length ? (
        <p className="ws__doc-gaps">
          Still to cover: {review.missing.join("; ")}.
        </p>
      ) : null}

      <div
        className="ws__doc-body"
        // Same renderer as the PDF path. Its content is escaped at the source
        // (see `esc` in proposal-spine) rather than trusted here.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
