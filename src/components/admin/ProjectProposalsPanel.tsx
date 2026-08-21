import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Download, Trash2, FileSignature, ExternalLink, Activity, Send, Eye } from "lucide-react";
import ProposalActivityLog from "@/components/admin/ProposalActivityLog";
import SidePanel from "@/components/admin/SidePanel";
import {
  renderProposalHtml, writtenSections,
  type ProposalContent,
} from "../../../supabase/functions/_shared/agents/proposal-spine";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type Proposal = {
  id: string;
  client_id: string;
  client_project_id: string;
  title: string;
  description: string | null;
  status: "draft" | "sent" | "signed" | "voided" | "declined";
  sent_at?: string | null;
  sent_to?: string | null;
  source_pdf_path: string | null;
  /** Agent-written proposals live here and have no PDF until they are sent. */
  content: unknown;
  client_signature_name: string | null;
  client_signed_at: string | null;
  declined_at?: string | null;
  decline_reason?: string | null;
  signed_pdf_path: string | null;
  created_at: string;
};

type Props = {
  clientId: string;
  clientProjectId: string;
  portalUrl?: string;
};

/**
 * Standalone Proposals panel for admin project tabs. Renders the toolbar
 * (upload + copy portal link) plus the proposal list and upload dialog.
 */
export default function ProjectProposalsPanel({ clientId, clientProjectId, portalUrl }: Props) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [openUpload, setOpenUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  // Timelines are collapsed by default — on a project with several proposals,
  // every log expanded at once buries the proposals themselves.
  const [openLog, setOpenLog] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [notifying, setNotifying] = useState<string | null>(null);

  const callFn = async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/proposal-sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Request failed");
    return data;
  };

  /**
   * Tell the client the proposal is waiting.
   *
   * Uploading one marks it 'sent' so the portal will show it — but nothing was
   * ever sent. No email, no SureContact activity, and no send date, which is
   * what every follow-up threshold measures from. So this is a separate,
   * deliberate step, and it is the one that makes the status true.
   */
  const notifyClient = async (p: Proposal) => {
    if (notifying) return;
    setNotifying(p.id);
    try {
      const data = await callFn({ action: "notify", clientId, proposalId: p.id });
      toast.success(
        data.renotified
          ? `Reminder sent to ${data.to}`
          : `Sent to ${data.to} — follow-up clock started`,
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send");
    } finally {
      setNotifying(null);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await callFn({ action: "list", clientId, clientProjectId });
      setProposals((data.proposals ?? []) as Proposal[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [clientId, clientProjectId]);

  const upload = async () => {
    if (!title.trim()) return toast.error("Title required");
    if (!file) return toast.error("Select a PDF");
    if (file.type !== "application/pdf") return toast.error("Only PDF files are supported");
    if (file.size > 25 * 1024 * 1024) return toast.error("PDF must be under 25MB");
    setUploading(true);
    try {
      const up = await callFn({
        action: "upload-url",
        clientId,
        clientProjectId,
        filename: file.name,
      });
      const putResp = await fetch(up.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (!putResp.ok) throw new Error("Upload failed");
      await callFn({
        action: "create",
        clientId,
        clientProjectId,
        title: title.trim(),
        description: description.trim() || undefined,
        sourcePdfPath: up.path,
      });
      toast.success("Proposal uploaded");
      setOpenUpload(false);
      setTitle(""); setDescription(""); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const downloadPdf = async (p: Proposal, variant: "source" | "signed") => {
    try {
      const data = await callFn({ action: "download", clientId, proposalId: p.id, variant });
      if (!data.pdfUrl) throw new Error("No PDF available");
      window.open(data.pdfUrl, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  /**
   * Read a proposal before sending it.
   *
   * Bree had two proposals on one project and no way to tell them apart —
   * "Source" downloads a PDF, and an agent-written proposal has no PDF until
   * it is sent, so for that one there was nothing to click at all. This shows
   * whichever the proposal actually has: the stored PDF, or the content
   * rendered through the same renderer the PDF and the client portal use, so
   * what you read here is what the client will read.
   */
  const [preview, setPreview] = useState<{ p: Proposal; pdfUrl: string | null } | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  const openPreview = async (p: Proposal) => {
    setPreviewing(p.id);
    let pdfUrl: string | null = null;
    if (p.source_pdf_path) {
      try {
        const data = await callFn({ action: "download", clientId, proposalId: p.id, variant: "source" });
        pdfUrl = data.pdfUrl ?? null;
      } catch {
        // Fall through to the rendered content — a missing file should not
        // stop you reading a proposal that has words in it.
        pdfUrl = null;
      }
    }
    setPreviewing(null);
    setPreview({ p, pdfUrl });
  };

  const removeProposal = async (p: Proposal) => {
    if (!confirm(`Delete proposal "${p.title}"? This cannot be undone.`)) return;
    try {
      await callFn({ action: "delete", clientId, proposalId: p.id });
      toast.success("Proposal deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const copyPortalLink = async () => {
    if (!portalUrl) return;
    await navigator.clipboard.writeText(portalUrl);
    toast.success("Portal link copied");
  };

  return (
    <>
      <div className="roster__toolbar">
        <div style={{ flex: 1, fontSize: 17, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>
          Proposals ({proposals.length})
        </div>
        <button className="crm-btn crm-btn--primary" onClick={() => setOpenUpload(true)}>
          <Upload size={14} /> Upload proposal
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, color: "var(--crm-taupe)" }}>Loading…</div>
      ) : proposals.length === 0 ? (
        <div style={{ padding: "60px 0", color: "var(--crm-taupe)", textAlign: "center", border: "1px dashed var(--crm-border-dark)", borderRadius: 12, marginTop: 16 }}>
          <div style={{ fontSize: 17, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 8 }}>No proposals yet</div>
          <div style={{ fontSize: 20 }}>Upload your first proposal PDF to send for signature.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
          {proposals.map((p) => {
            const isSigned = p.status === "signed";
            const isVoided = p.status === "voided";
            // Declined is not voided. Voided is us withdrawing the document;
            // declined is the client turning it down, and it is the only
            // number that says how often we lose work — so it gets its own
            // colour rather than being folded in with the ones we pulled.
            const isDeclined = p.status === "declined";
            return (
              <div key={p.id} style={{
                background: "hsl(40 20% 97% / 0.03)",
                border: "1px solid var(--crm-border-dark)",
                borderRadius: 12, padding: "20px 22px",
                display: "flex", flexDirection: "column", gap: 10,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 16, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-accent)", marginBottom: 6 }}>
                      <FileSignature size={12} /> Proposal
                    </div>
                    <h3 style={{ fontFamily: "var(--crm-font-serif)", fontWeight: 300, fontSize: 26, color: "var(--crm-warm-white)", margin: 0, lineHeight: 1.2 }}>
                      {p.title}
                    </h3>
                    {p.description && (
                      <p style={{ marginTop: 6, color: "var(--crm-stone)", fontSize: 18 }}>{p.description}</p>
                    )}
                  </div>
                  <span style={{
                    fontSize: 15, letterSpacing: "0.2em", textTransform: "uppercase",
                    padding: "4px 10px", borderRadius: 999,
                    background: isSigned
                      ? "hsl(120 30% 50% / 0.15)"
                      : isVoided
                        ? "hsl(0 30% 50% / 0.15)"
                        : isDeclined
                          ? "hsl(28 45% 50% / 0.15)"
                          : "hsl(40 20% 97% / 0.06)",
                    color: isSigned
                      ? "hsl(120 60% 70%)"
                      : isVoided
                        ? "hsl(0 60% 70%)"
                        : isDeclined
                          ? "hsl(28 70% 70%)"
                          : "var(--crm-taupe)",
                    whiteSpace: "nowrap",
                  }}>{p.status}</span>
                </div>

                <div style={{ fontSize: 17, color: "var(--crm-taupe)" }}>
                  {/* What this proposal actually is, without opening it. Two
                      proposals on one project looked identical here — same
                      date line, same buttons — which is how you end up unsure
                      which one is the real one. */}
                  {(() => {
                    const secs = p.content
                      ? writtenSections(p.content as ProposalContent).length
                      : 0;
                    if (secs) return `Written · ${secs} section${secs === 1 ? "" : "s"}`;
                    if (p.source_pdf_path) return "Uploaded PDF";
                    return "Empty — nothing written yet";
                  })()}
                  {" · "}
                  {new Date(p.created_at).toLocaleDateString()}
                  {p.client_signed_at && (
                    <> · Signed {new Date(p.client_signed_at).toLocaleDateString()} by {p.client_signature_name}</>
                  )}
                  {p.declined_at && !p.client_signed_at && (
                    <> · Declined {new Date(p.declined_at).toLocaleDateString()}
                      {p.decline_reason ? ` — "${p.decline_reason}"` : ""}</>
                  )}
                  {/* The distinction that was invisible: a proposal can read
                      'sent' and have gone to nobody, because uploading one sets
                      that status without emailing anything. */}
                  {p.sent_at
                    ? <> · Sent to {p.sent_to ?? "the client"} on {new Date(p.sent_at).toLocaleDateString()}</>
                    : !isSigned && !isVoided && (
                      <> · <strong style={{ color: "hsl(28 70% 70%)" }}>Not sent to the client yet</strong></>
                    )}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  <button
                    className="crm-btn crm-btn--ghost crm-btn--sm"
                    onClick={() => void openPreview(p)}
                    disabled={previewing === p.id}
                    title="Read this proposal"
                  >
                    <Eye size={12} /> {previewing === p.id ? "Opening…" : "Preview"}
                  </button>
                  {p.source_pdf_path && (
                    <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => downloadPdf(p, "source")}>
                      <Download size={12} /> Source
                    </button>
                  )}
                  {isSigned && (
                    <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => downloadPdf(p, "signed")}>
                      <Download size={12} /> Signed PDF
                    </button>
                  )}
                  {!isSigned && (
                    <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => removeProposal(p)} title="Delete">
                      <Trash2 size={12} /> Delete
                    </button>
                  )}
                  {!isSigned && !isVoided && !isDeclined && (
                    <button
                      className={`crm-btn crm-btn--sm ${p.sent_at ? "crm-btn--ghost" : "crm-btn--bronze"}`}
                      onClick={() => void notifyClient(p)}
                      disabled={notifying === p.id}
                      title={p.sent_at
                        ? "Send the client another link to this proposal"
                        : "Email the client a link to review and sign it, and start the follow-up clock"}
                    >
                      <Send size={12} />{" "}
                      {notifying === p.id
                        ? "Sending…"
                        : p.sent_at ? "Resend link" : "Send to client"}
                    </button>
                  )}
                  <button className="crm-btn crm-btn--ghost crm-btn--sm"
                    onClick={() => setOpenLog(openLog === p.id ? null : p.id)}>
                    <Activity size={12} /> {openLog === p.id ? "Hide activity" : "Activity"}
                  </button>
                </div>

                {openLog === p.id && <ProposalActivityLog proposalId={p.id} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Wide on purpose: a proposal read in a narrow column is a proposal you
          skim instead of check, and checking is the whole point of opening it
          before it goes to a client. */}
      <SidePanel
        open={!!preview}
        title={preview?.p.title ?? "Proposal"}
        subtitle={preview
          ? `${preview.p.status}${preview.p.sent_at ? " · sent" : " · not sent yet"}`
          : undefined}
        width={860}
        onClose={() => setPreview(null)}
        footer={
          preview ? (
            <>
              {!preview.p.client_signed_at && (
                <button
                  className="crm-btn crm-btn--ghost crm-btn--sm"
                  onClick={() => { const p2 = preview.p; setPreview(null); void removeProposal(p2); }}
                >
                  <Trash2 size={12} /> Delete
                </button>
              )}
              {preview.pdfUrl && (
                <a className="crm-btn crm-btn--ghost crm-btn--sm"
                  href={preview.pdfUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={12} /> Open PDF
                </a>
              )}
              <button className="crm-btn crm-btn--ghost" onClick={() => setPreview(null)}>Close</button>
            </>
          ) : undefined
        }
      >
        {preview && <ProposalPreviewBody p={preview.p} pdfUrl={preview.pdfUrl} />}
      </SidePanel>

      <Dialog open={openUpload} onOpenChange={(v) => { if (!uploading) setOpenUpload(v); }}>
        <DialogContent className="crm-shell !bg-[hsl(36_5%_16%)] !border-[hsl(40_20%_97%/0.08)] !text-[hsl(40_20%_97%)] !rounded-none !max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif italic text-2xl text-[hsl(40_20%_97%)]">Upload proposal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="crm-label">Title *</label>
              <input className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Proposal v1" />
            </div>
            <div>
              <label className="crm-label">Description</label>
              <textarea className="crm-input" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional internal note for the client" />
            </div>
            <div>
              <label className="crm-label">PDF file *</label>
              <input ref={fileRef} type="file" accept="application/pdf" className="crm-input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file && <div style={{ marginTop: 6, fontSize: 16, color: "var(--crm-taupe)" }}>{file.name} · {(file.size / 1024).toFixed(0)} KB</div>}
            </div>
          </div>
          <DialogFooter>
            <button className="crm-btn crm-btn--ghost" onClick={() => setOpenUpload(false)} disabled={uploading}>Cancel</button>
            <button className="crm-btn crm-btn--primary" onClick={upload} disabled={uploading}>
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * What a proposal actually looks like.
 *
 * A PDF is shown as a PDF. Written content goes through renderProposalHtml —
 * the same renderer the PDF path and the client portal use — so this is not a
 * separate idea of what the document says. When there is neither, the panel
 * says so plainly rather than showing an empty frame that reads as broken.
 */
function ProposalPreviewBody({ p, pdfUrl }: { p: Proposal; pdfUrl: string | null }) {
  const content = (p.content ?? null) as ProposalContent | null;
  const sections = content ? writtenSections(content).length : 0;

  const html = useMemo(
    () => (sections ? renderProposalHtml(p.title, content as ProposalContent) : ""),
    [content, p.title, sections],
  );

  if (pdfUrl) {
    return (
      <iframe
        src={pdfUrl}
        title={p.title}
        style={{ width: "100%", height: "72vh", border: "1px solid var(--crm-border-dark)", borderRadius: 8, background: "#fff" }}
      />
    );
  }

  if (sections) {
    return (
      <div
        className="ws__doc-body"
        // Same renderer as the PDF path. Content is escaped at the source (see
        // `esc` in proposal-spine) rather than trusted here.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <p style={{ color: "var(--crm-taupe)", fontSize: 16, fontStyle: "italic" }}>
      Nothing written yet — this proposal has no PDF and no sections. It was
      started but never filled in.
    </p>
  );
}
