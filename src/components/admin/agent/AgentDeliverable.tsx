// The thing the agent made, where you can actually get at it.
//
// A proposal was being written, rendered to PDF and filed against its project,
// and none of that was visible in the conversation that asked for it — so it
// read as though nothing had happened. The file has a home already; this is the
// handle on it from the place you asked.
//
// Downloading it was not enough on its own: the owner asked for a document and
// got a button, so the next question was always "well, what does it say?". The
// document now opens where it was asked for — the written body inline, and the
// rendered PDF in a frame, without leaving the thread.
import { useState } from "react";
import { toast } from "sonner";
import { FileText, Download, ExternalLink, FolderOpen, ChevronDown, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { AgentAction } from "@/lib/agentsApi";
import { deliverableOf, type Result } from "./deliverable";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type Section = { key?: string; heading?: string; body?: string };

export default function AgentDeliverable({ action }: { action: AgentAction }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [openBody, setOpenBody] = useState(false);
  const result = deliverableOf(action);
  if (!result) return null;

  /** A signed URL for the source PDF. Cached, since signing costs a round trip. */
  const signedPdf = async (): Promise<string> => {
    if (pdfUrl) return pdfUrl;
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
    setPdfUrl(data.pdfUrl);
    return data.pdfUrl as string;
  };

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open that");
    } finally {
      setBusy(false);
    }
  };

  const openPdf = () => withBusy(async () => {
    window.open(await signedPdf(), "_blank", "noopener");
  });

  const togglePreview = () => withBusy(async () => {
    if (pdfUrl) { setPdfUrl(null); return; }
    await signedPdf();
  });

  // The written proposal, read straight off the row. The PDF is a rendering of
  // this, so showing the text needs no signing and no download.
  const toggleBody = () => withBusy(async () => {
    if (sections) { setOpenBody((v) => !v); return; }
    const { data, error } = await supabase
      .from("client_proposals")
      .select("content")
      .eq("id", result.proposal_id!)
      .maybeSingle();
    if (error) throw error;
    const content = (data?.content ?? {}) as { sections?: Section[] };
    const list = content.sections ?? [];
    if (!list.length) throw new Error("This proposal has no written body yet");
    setSections(list);
    setOpenBody(true);
  });

  if (result.proposal_id) {
    return (
      <div className="ws__deliverable" style={{ flexWrap: "wrap" }}>
        <FileText size={16} className="ws__deliverable-icon" />
        <div className="ws__deliverable-body">
          <div className="ws__deliverable-title">{action.title}</div>
          <div className="ws__deliverable-sub">
            Draft proposal · filed against the project · not visible to the client
          </div>
        </div>
        <div className="ws__deliverable-actions">
          <button className="crm-btn crm-btn--ghost crm-btn--sm" disabled={busy} onClick={() => void toggleBody()}>
            <ChevronDown
              size={12}
              style={{ transform: openBody ? "rotate(180deg)" : "none", transition: "transform .15s" }}
            />
            {openBody ? "Hide" : "Read"}
          </button>
          <button className="crm-btn crm-btn--ghost crm-btn--sm" disabled={busy} onClick={() => void togglePreview()}>
            <Eye size={12} /> {pdfUrl ? "Close" : "Preview"}
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

        {openBody && sections && (
          <div
            style={{
              flexBasis: "100%",
              marginTop: 10,
              maxHeight: 340,
              overflowY: "auto",
              borderTop: "1px solid var(--crm-border-dark)",
              paddingTop: 10,
            }}
          >
            {sections.map((s, i) => (
              <div key={s.key ?? i} style={{ marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
                    color: "var(--crm-taupe)", marginBottom: 4,
                  }}
                >
                  {s.heading ?? s.key}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "var(--crm-warm-white)" }}>
                  {s.body ?? ""}
                </div>
              </div>
            ))}
          </div>
        )}

        {pdfUrl && (
          <iframe
            title={action.title}
            src={pdfUrl}
            style={{
              flexBasis: "100%", marginTop: 10, height: 460, width: "100%",
              border: "1px solid var(--crm-border-dark)", borderRadius: 6, background: "var(--crm-warm-white)",
            }}
          />
        )}
      </div>
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
