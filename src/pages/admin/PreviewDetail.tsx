import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Copy, Check, ExternalLink, Upload, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

type Project = any; type FileRow = any; type Comment = any; type Reply = any;

export default function PreviewDetail() {
  const { id } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const [replyText, setReplyText] = useState<Record<string, string>>({});

  const base = useMemo(() => window.location.origin, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("preview-admin", { body: { action: "get", id } });
    if (error) toast.error(error.message);
    else {
      setProject(data?.project);
      setFiles(data?.files ?? []);
      setComments(data?.comments ?? []);
      setReplies(data?.replies ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [id]);

  const shareUrl = project ? `${base}/p/${project.slug}` : "";

  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const uploadFiles = async (filelist: FileList | null, asZip: boolean) => {
    if (!filelist || filelist.length === 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("project_id", project.id);
      if (asZip) {
        form.append("zip", filelist[0]);
      } else {
        for (const f of Array.from(filelist)) {
          // Use webkitRelativePath if available (folder upload), else file name
          const rel = (f as any).webkitRelativePath || f.name;
          // Strip top folder if folder upload
          const path = rel.includes("/") ? rel.split("/").slice(1).join("/") || f.name : rel;
          form.append(`file:${path}`, f);
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/preview-upload`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.access_token}` },
          body: form,
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      toast.success(`Uploaded ${json.file_count} files`);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
      if (zipInput.current) zipInput.current.value = "";
    }
  };

  const setStatus = async (commentId: string, status: string) => {
    await supabase.functions.invoke("preview-admin?action=comment", {
      method: "PATCH", body: { id: commentId, status },
    });
    load();
  };

  const deleteComment = async (commentId: string) => {
    if (!confirm("Delete this comment?")) return;
    await supabase.functions.invoke("preview-admin?action=comment", {
      method: "DELETE", body: { id: commentId },
    });
    load();
  };

  const sendReply = async (commentId: string) => {
    const body = (replyText[commentId] || "").trim();
    if (!body) return;
    await supabase.functions.invoke("preview-admin?action=reply", {
      method: "POST", body: { comment_id: commentId, body },
    });
    setReplyText((s) => ({ ...s, [commentId]: "" }));
    load();
  };

  const toggleFeedback = async () => {
    const { data } = await supabase.functions.invoke("preview-admin?action=update", {
      method: "PATCH", body: { id: project.id, feedback_enabled: !project.feedback_enabled },
    });
    if (data?.project) setProject(data.project);
  };

  const archiveProject = async () => {
    if (!confirm("Archive this preview? Clients will get 404.")) return;
    await supabase.functions.invoke("preview-admin?action=update", {
      method: "PATCH", body: { id: project.id, archived: !project.archived },
    });
    load();
  };

  if (loading || !project) return <AdminLayout><div style={{ padding: 24 }}>Loading…</div></AdminLayout>;

  const repliesByComment: Record<string, Reply[]> = {};
  for (const r of replies) (repliesByComment[r.comment_id] ||= []).push(r);

  return (
    <AdminLayout>
      <div style={{ marginBottom: 12 }}>
        <Link to="/admin/previews" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "hsl(30 8% 50%)" }}>
          <ArrowLeft size={14} /> Back to previews
        </Link>
      </div>

      <div className="crm-card" style={{ marginBottom: 16 }}>
        <div className="crm-card__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div className="crm-card__title">{project.name}</div>
            <div className="crm-card__sub">{project.client_label || "—"} · {project.is_multi_page ? "Multi-page" : "Single page"}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="crm-btn" onClick={toggleFeedback}>
              Feedback: {project.feedback_enabled ? "On" : "Off"}
            </button>
            <button className="crm-btn" onClick={archiveProject}>
              {project.archived ? "Unarchive" : "Archive"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14, padding: 12, background: "hsl(30 8% 96%)", borderRadius: 8, display: "flex", alignItems: "center", gap: 12 }}>
          <code style={{ flex: 1, fontFamily: "monospace", fontSize: 13 }}>{shareUrl}</code>
          <button className="crm-btn crm-btn--ghost" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
          <a className="crm-btn crm-btn--primary" href={shareUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>
        </div>
      </div>

      <div className="crm-card" style={{ marginBottom: 16 }}>
        <div className="crm-card__header"><div className="crm-card__title">Files ({files.length})</div></div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input ref={fileInput} type="file" multiple
            // @ts-expect-error nonstandard
            webkitdirectory=""
            style={{ display: "none" }} onChange={(e) => uploadFiles(e.target.files, false)} />
          <input ref={zipInput} type="file" accept=".zip" style={{ display: "none" }} onChange={(e) => uploadFiles(e.target.files, true)} />
          <button className="crm-btn crm-btn--primary" onClick={() => fileInput.current?.click()} disabled={uploading}>
            <Upload size={14} /> Upload folder
          </button>
          <button className="crm-btn" onClick={() => zipInput.current?.click()} disabled={uploading}>
            <Upload size={14} /> Upload .zip
          </button>
          {uploading && <span style={{ alignSelf: "center", color: "hsl(30 8% 50%)" }}>Uploading…</span>}
        </div>
        {files.length > 0 && (
          <ul style={{ marginTop: 12, fontSize: 13, fontFamily: "monospace", maxHeight: 240, overflowY: "auto" }}>
            {files.map((f) => (
              <li key={f.id} style={{ padding: "4px 0", color: f.path === project.entry_path ? "hsl(150 35% 30%)" : undefined }}>
                {f.path === project.entry_path && "★ "}{f.path} <span style={{ color: "hsl(30 8% 60%)" }}>({Math.ceil((f.size_bytes ?? 0) / 1024)} KB)</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="crm-card">
        <div className="crm-card__header"><div className="crm-card__title">Feedback ({comments.length})</div></div>
        {comments.length === 0 ? (
          <div style={{ padding: 16, color: "hsl(30 8% 50%)" }}>No comments yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            {comments.map((c) => (
              <div key={c.id} style={{ border: "1px solid hsl(30 10% 88%)", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      Pin #{c.pin_number} · {c.author_name || "Guest"} {c.status === "resolved" && <span style={{ color: "hsl(150 35% 35%)" }}>· Resolved</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "hsl(30 8% 55%)" }}>
                      {c.page_path} · {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="crm-btn crm-btn--ghost" onClick={() => setStatus(c.id, c.status === "resolved" ? "open" : "resolved")}>
                      {c.status === "resolved" ? "Reopen" : "Resolve"}
                    </button>
                    <button className="crm-btn crm-btn--ghost" onClick={() => deleteComment(c.id)}><Trash2 size={14} /></button>
                  </div>
                </div>
                <div style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 14 }}>{c.body}</div>
                {(repliesByComment[c.id] || []).map((r) => (
                  <div key={r.id} style={{ marginTop: 8, padding: 8, background: r.is_admin ? "hsl(30 30% 18%)" : "hsl(30 8% 95%)", color: r.is_admin ? "white" : undefined, borderRadius: 6, fontSize: 13 }}>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>{r.author_name || (r.is_admin ? "Admin" : "Guest")}</div>
                    {r.body}
                  </div>
                ))}
                <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
                  <input className="crm-input" placeholder="Reply…"
                    value={replyText[c.id] || ""} onChange={(e) => setReplyText((s) => ({ ...s, [c.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && sendReply(c.id)} />
                  <button className="crm-btn" onClick={() => sendReply(c.id)}>Reply</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
