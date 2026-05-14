import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Upload, Download, Trash2, FileSignature, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import ProjectInvoicesCard from "@/components/admin/ProjectInvoicesCard";
import ProjectPreviewCard from "@/components/admin/ProjectPreviewCard";

const TYPE_LABEL: Record<string, string> = {
  app_development: "App Development",
  web_development: "Web Development",
  marketing: "Marketing",
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type Proposal = {
  id: string;
  client_id: string;
  client_project_id: string;
  title: string;
  description: string | null;
  status: "draft" | "sent" | "signed" | "voided";
  source_pdf_path: string | null;
  client_signature_name: string | null;
  client_signed_at: string | null;
  signed_pdf_path: string | null;
  created_at: string;
};

type Project = { id: string; client_id: string; name: string; type: string };
type Client = { id: string; business_name: string | null; contact_name: string | null };

export default function AppDevelopmentView() {
  const { id: clientId, projectId } = useParams<{ id: string; projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [openUpload, setOpenUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const portalUrl = client?.id ? `${window.location.origin}/portal/${client.id}` : "";

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

  const load = async () => {
    if (!projectId || !clientId) return;
    setLoading(true);
    try {
      const [{ data: proj }, { data: c }] = await Promise.all([
        supabase.from("client_projects").select("id, client_id, name, type").eq("id", projectId).maybeSingle(),
        supabase.from("clients").select("id, business_name, contact_name").eq("id", clientId).maybeSingle(),
      ]);
      setProject(proj as Project | null);
      setClient(c as Client | null);
      const data = await callFn({ action: "list", clientId, clientProjectId: projectId });
      setProposals((data.proposals ?? []) as Proposal[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [projectId, clientId]);

  const upload = async () => {
    if (!clientId || !projectId) return;
    if (!title.trim()) return toast.error("Title required");
    if (!file) return toast.error("Select a PDF");
    if (file.type !== "application/pdf") return toast.error("Only PDF files are supported");
    if (file.size > 25 * 1024 * 1024) return toast.error("PDF must be under 25MB");

    setUploading(true);
    try {
      const up = await callFn({
        action: "upload-url",
        clientId,
        clientProjectId: projectId,
        filename: file.name,
      });
      // Upload via signed URL
      const putResp = await fetch(up.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (!putResp.ok) throw new Error("Upload failed");
      await callFn({
        action: "create",
        clientId,
        clientProjectId: projectId,
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
    await navigator.clipboard.writeText(portalUrl);
    toast.success("Portal link copied");
  };

  if (loading) return <AdminLayout><div style={{ padding: 40, color: "var(--crm-taupe)" }}>Loading…</div></AdminLayout>;
  if (!project || !client) return <AdminLayout><div style={{ padding: 40 }}>Project not found.</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="roster">
        <Link to={`/admin/clients/${clientId}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--crm-taupe)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 18 }}>
          <ArrowLeft size={14} /> Back to {client.business_name ?? "client"}
        </Link>

        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">App Development</div>
            <h1 className="roster__title">{project.name}</h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              Upload proposals for the client to review and sign in their portal.
            </p>
          </div>
        </div>

        <div className="roster__toolbar" style={{ marginTop: 24 }}>
          <div style={{ flex: 1, fontSize: 13, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>
            Proposals ({proposals.length})
          </div>
          <button className="crm-btn crm-btn--ghost" onClick={copyPortalLink}>
            <ExternalLink size={14} /> Copy portal link
          </button>
          <button className="crm-btn crm-btn--primary" onClick={() => setOpenUpload(true)}>
            <Upload size={14} /> Upload proposal
          </button>
        </div>

        {proposals.length === 0 ? (
          <div style={{ padding: "60px 0", color: "var(--crm-taupe)", textAlign: "center", border: "1px dashed var(--crm-border-dark)", borderRadius: 12, marginTop: 16 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 8 }}>No proposals yet</div>
            <div style={{ fontSize: 16 }}>Upload your first proposal PDF to send for signature.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
            {proposals.map((p) => {
              const isSigned = p.status === "signed";
              const isVoided = p.status === "voided";
              return (
                <div key={p.id} style={{
                  background: "hsl(40 20% 97% / 0.03)",
                  border: "1px solid var(--crm-border-dark)",
                  borderRadius: 12, padding: "20px 22px",
                  display: "flex", flexDirection: "column", gap: 10,
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-accent)", marginBottom: 6 }}>
                        <FileSignature size={12} /> Proposal
                      </div>
                      <h3 style={{ fontFamily: "var(--crm-font-serif)", fontWeight: 300, fontSize: 22, color: "var(--crm-warm-white)", margin: 0, lineHeight: 1.2 }}>
                        {p.title}
                      </h3>
                      {p.description && (
                        <p style={{ marginTop: 6, color: "var(--crm-stone)", fontSize: 14 }}>{p.description}</p>
                      )}
                    </div>
                    <span style={{
                      fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
                      padding: "4px 10px", borderRadius: 999,
                      background: isSigned ? "hsl(120 30% 50% / 0.15)" : isVoided ? "hsl(0 30% 50% / 0.15)" : "hsl(40 20% 97% / 0.06)",
                      color: isSigned ? "hsl(120 60% 70%)" : isVoided ? "hsl(0 60% 70%)" : "var(--crm-taupe)",
                      whiteSpace: "nowrap",
                    }}>{p.status}</span>
                  </div>

                  <div style={{ fontSize: 13, color: "var(--crm-taupe)" }}>
                    Uploaded {new Date(p.created_at).toLocaleDateString()}
                    {p.client_signed_at && (
                      <> · Signed {new Date(p.client_signed_at).toLocaleDateString()} by {p.client_signature_name}</>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => downloadPdf(p, "source")}>
                      <Download size={12} /> Source
                    </button>
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
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <ProjectInvoicesCard clientId={clientId!} clientProjectId={projectId!} />
      </div>

      <Dialog open={openUpload} onOpenChange={(v) => { if (!uploading) setOpenUpload(v); }}>
        <DialogContent className="crm-shell !bg-[hsl(36_5%_16%)] !border-[hsl(40_20%_97%/0.08)] !text-[hsl(40_20%_97%)] !rounded-none !max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif italic text-2xl text-[hsl(40_20%_97%)]">Upload proposal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="crm-label">Title *</label>
              <input className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mobile App Proposal v1" />
            </div>
            <div>
              <label className="crm-label">Description</label>
              <textarea className="crm-input" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Optional internal note for the client" />
            </div>
            <div>
              <label className="crm-label">PDF file *</label>
              <input ref={fileRef} type="file" accept="application/pdf" className="crm-input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file && <div style={{ marginTop: 6, fontSize: 12, color: "var(--crm-taupe)" }}>{file.name} · {(file.size / 1024).toFixed(0)} KB</div>}
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
    </AdminLayout>
  );
}
