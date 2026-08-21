// The thing the agent made, where you can actually get at it.
//
// A proposal was being written, rendered to PDF and filed against its project,
// and none of that was visible in the conversation that asked for it — so it
// read as though nothing had happened. The file has a home already; this is the
// handle on it from the place you asked.
import { useState } from "react";
import { toast } from "sonner";
import { FileText, Download, ExternalLink, FolderOpen, BookOpen, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { AgentAction } from "@/lib/agentsApi";
import { deliverableOf, type Result } from "./deliverable";
import {
  renderProposalHtml, type ProposalContent,
} from "../../../../supabase/functions/_shared/agents/proposal-spine";


const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export default function AgentDeliverable({ action }: { action: AgentAction }) {
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const [busy, setBusy] = useState(false);
  // The written document, rendered in place. Asking for a proposal and getting
  // a filename is the thing that made the agent feel like it had done nothing.
  const [reading, setReading] = useState<{ title: string; html: string } | null>(null);
  const result = deliverableOf(action);
  if (!result) return null;

  const openPdf = async () => {
    if (!result.proposal_id || !result.client_id) return;
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/proposal-sign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          action: "download",
          clientId: result.client_id,
          proposalId: result.proposal_id,
          variant: "source",
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.pdfUrl) throw new Error(data.error || "No PDF yet");
      // A signed URL, so opening it is the download.
      window.open(data.pdfUrl, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open that");
    } finally {
      setBusy(false);
    }
  };

  const read = async () => {
    if (!result.proposal_id) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from("client_proposals")
        .select("title, content").eq("id", result.proposal_id).maybeSingle();
      if (error) throw error;
      if (!data?.content) throw new Error("Nothing was written into this draft");
      setReading({
        title: data.title,
        html: renderProposalHtml(data.title, data.content as ProposalContent),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open that");
    } finally {
      setBusy(false);
    }
  };

  if (result.proposal_id) {
    return (
      <>
        <div className="ws__deliverable">
          <FileText size={16} className="ws__deliverable-icon" />
          <div className="ws__deliverable-body">
            <div className="ws__deliverable-title">{action.title}</div>
            <div className="ws__deliverable-sub">
              Draft proposal · filed against the project · not visible to the client
            </div>
          </div>
          <div className="ws__deliverable-actions">
            {/* Clicking a proposal in the chat points the sidebar at THAT
                document. Reading one version while the agent edits another is
                the mismatch this closes. */}
            {result.proposal_id && (
              <button className="crm-btn crm-btn--ghost crm-btn--sm"
                onClick={() => setParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set("proposal", result.proposal_id!);
                  return next;
                }, { replace: true })}>
                Show in panel
              </button>
            )}
            <button className="crm-btn crm-btn--ghost crm-btn--sm" disabled={busy} onClick={() => void read()}>
              <BookOpen size={12} /> Read
            </button>
            <button className="crm-btn crm-btn--ghost crm-btn--sm" disabled={busy} onClick={() => void openPdf()}>
              <Download size={12} /> {busy ? "…" : "PDF"}
            </button>
            {result.client_id && result.client_project_id && (
              <button className="crm-btn crm-btn--ghost crm-btn--sm"
                onClick={() => navigate(`/admin/clients/${result.client_id}/projects/${result.client_project_id}`)}>
                <ExternalLink size={12} /> Open
              </button>
            )}
          </div>
        </div>
        {reading && (
          <div className="ws__reader" role="dialog" aria-label={reading.title}
            onClick={() => setReading(null)}>
            <div className="ws__reader-panel" onClick={(e) => e.stopPropagation()}>
              <header className="ws__reader-bar">
                <span>{reading.title}</span>
                <button className="ws__reader-close" aria-label="Close"
                  onClick={() => setReading(null)}><X size={16} /></button>
              </header>
              <div className="ws__reader-body"
                dangerouslySetInnerHTML={{ __html: reading.html }} />
            </div>
          </div>
        )}
      </>
    );
  }


  const label = result.task_id ? "Task added to the board" : "Project created";
  return (
    <div className="ws__deliverable">
      <FolderOpen size={16} className="ws__deliverable-icon" />
      <div className="ws__deliverable-body">
        <div className="ws__deliverable-title">{action.title}</div>
        <div className="ws__deliverable-sub">
          {label}{result.type ? ` · ${result.type.replace(/_/g, " ")}` : ""}
        </div>
      </div>
      {result.client_id && result.client_project_id && (
        <div className="ws__deliverable-actions">
          <button className="crm-btn crm-btn--ghost crm-btn--sm"
            onClick={() => navigate(`/admin/clients/${result.client_id}/projects/${result.client_project_id}`)}>
            <ExternalLink size={12} /> Open
          </button>
        </div>
      )}
    </div>
  );
}
