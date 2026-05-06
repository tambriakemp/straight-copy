import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Copy, Check, ExternalLink, Upload, Trash2, ArrowLeft, Star,
  ChevronDown, ChevronRight, FileText, Image as ImageIcon, Code2, Box, AlertTriangle, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import AiEditDialog from "@/components/admin/preview/AiEditDialog";

type Project = any; type FileRow = any; type Comment = any; type Reply = any;
type Status = "open" | "in_progress" | "resolved";

const COLUMNS: { key: Status; title: string }[] = [
  { key: "open", title: "Open" },
  { key: "in_progress", title: "In progress" },
  { key: "resolved", title: "Resolved" },
];

function classify(path: string): "image" | "script" | "style" | "font" | "other" {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["png","jpg","jpeg","gif","webp","svg","ico","avif"].includes(ext)) return "image";
  if (["js","mjs","ts","tsx","jsx","json"].includes(ext)) return "script";
  if (["css","scss","less"].includes(ext)) return "style";
  if (["woff","woff2","ttf","otf","eot"].includes(ext)) return "font";
  return "other";
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}

export default function PreviewDetail({ overrideId, backTo }: { overrideId?: string; backTo?: string } = {}) {
  const params = useParams();
  const id = overrideId ?? params.id;
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [missing, setMissing] = useState<{ ref: string; in_page: string }[]>([]);
  const [activeComment, setActiveComment] = useState<Comment | null>(null);
  const [replyText, setReplyText] = useState("");
  const [pageFilter, setPageFilter] = useState<string>("__all__");
  const [dragOver, setDragOver] = useState<Status | null>(null);
  const [aiEditPath, setAiEditPath] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const dropzone = useRef<HTMLDivElement>(null);

  const base = useMemo(() => window.location.origin, []);

  const load = async () => {
    const { data, error } = await supabase.functions.invoke("preview-admin", { body: { action: "get", id } });
    if (error) { toast.error(error.message); return; }
    setProject(data?.project);
    setFiles(data?.files ?? []);
    setComments(data?.comments ?? []);
    setReplies(data?.replies ?? []);
    setLoading(false);
  };

  const loadMissing = async () => {
    const { data } = await supabase.functions.invoke("preview-admin", { body: { action: "missing_assets", id } });
    setMissing(data?.missing ?? []);
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => { if (project) loadMissing(); }, [project?.id, files.length]);
  useEffect(() => { const t = setInterval(load, 20000); return () => clearInterval(t); }, [id]);

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
          const rel = (f as any).webkitRelativePath || f.name;
          const path = rel.includes("/") ? rel.split("/").slice(1).join("/") || f.name : rel;
          form.append(`file:${path}`, f);
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/preview-upload`,
        { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}` }, body: form },
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

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dropzone.current?.classList.remove("is-drag");
    const dt = e.dataTransfer;
    if (!dt?.files?.length) return;
    // If single .zip file, treat as zip
    if (dt.files.length === 1 && /\.zip$/i.test(dt.files[0].name)) {
      await uploadFiles(dt.files, true);
    } else {
      await uploadFiles(dt.files, false);
    }
  };

  const setEntry = async (path: string) => {
    await supabase.functions.invoke("preview-admin", {
      body: { action: "update", id: project.id, entry_path: path, is_multi_page: pages.length > 1 },
    });
    await load();
    toast.success("Entry page updated");
  };

  const deleteFile = async (path: string) => {
    if (!confirm(`Delete "${path}"?`)) return;
    await supabase.functions.invoke("preview-admin", {
      body: { action: "file_delete", project_id: project.id, path },
    });
    await load();
  };

  const setStatus = async (commentId: string, status: Status) => {
    await supabase.functions.invoke("preview-admin", { body: { action: "comment_status", id: commentId, status } });
    setComments((cs) => cs.map((c) => (c.id === commentId ? { ...c, status } : c)));
    if (activeComment?.id === commentId) setActiveComment({ ...activeComment, status });
  };

  const deleteComment = async (commentId: string) => {
    if (!confirm("Delete this comment?")) return;
    await supabase.functions.invoke("preview-admin", { body: { action: "comment_delete", id: commentId } });
    setActiveComment(null);
    load();
  };

  const sendReply = async () => {
    if (!activeComment) return;
    const body = replyText.trim();
    if (!body) return;
    await supabase.functions.invoke("preview-admin", { body: { action: "reply", comment_id: activeComment.id, body } });
    setReplyText("");
    await load();
  };

  const toggleFeedback = async () => {
    const { data } = await supabase.functions.invoke("preview-admin", {
      body: { action: "update", id: project.id, feedback_enabled: !project.feedback_enabled },
    });
    if (data?.project) setProject(data.project);
  };

  const archiveProject = async () => {
    if (!confirm(project.archived ? "Unarchive this preview?" : "Archive this preview? Clients will get 404.")) return;
    await supabase.functions.invoke("preview-admin", {
      body: { action: "update", id: project.id, archived: !project.archived },
    });
    load();
  };

  if (loading || !project) return <AdminLayout><div style={{ padding: "48px 52px" }}>Loading…</div></AdminLayout>;

  const pages = files.filter((f) => /\.html?$/i.test(f.path));
  const assets = files.filter((f) => !/\.html?$/i.test(f.path));
  const assetCounts = assets.reduce<Record<string, number>>((acc, f) => {
    const k = classify(f.path);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const repliesByComment: Record<string, Reply[]> = {};
  for (const r of replies) (repliesByComment[r.comment_id] ||= []).push(r);

  const distinctPages = Array.from(new Set(comments.map((c) => c.page_path)));
  const visibleComments = comments.filter((c) => pageFilter === "__all__" || c.page_path === pageFilter);
  const cardsByStatus: Record<Status, Comment[]> = { open: [], in_progress: [], resolved: [] };
  for (const c of visibleComments) {
    const s: Status = (c.status === "in_progress" || c.status === "resolved") ? c.status : "open";
    cardsByStatus[s].push(c);
  }
  const openCount = comments.filter((c) => c.status !== "resolved").length;

  return (
    <AdminLayout>
      <div style={{ padding: "48px 52px 96px", maxWidth: 1400, margin: "0 auto", width: "100%", overflowY: "auto", flex: 1 }}>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <Link to={backTo ?? "/admin"} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--crm-taupe)", fontSize: 14, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          <ArrowLeft size={14} /> Back
        </Link>
      </div>

      <header style={{ marginBottom: 24, paddingBottom: 20, borderBottom: "1px solid var(--crm-border-dark)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.35em", textTransform: "uppercase", color: "var(--crm-taupe)", marginBottom: 8 }}>
              Preview Project
            </div>
            <h1 style={{ fontFamily: "var(--crm-font-serif)", fontWeight: 300, fontSize: 38, lineHeight: 1.1, color: "var(--crm-warm-white)", margin: 0 }}>
              {project.name}
            </h1>
            <div style={{ marginTop: 10, color: "var(--crm-stone)", fontSize: 15, display: "flex", gap: 16, flexWrap: "wrap" }}>
              {project.client_label && <span>{project.client_label}</span>}
              <span>{pages.length} {pages.length === 1 ? "page" : "pages"}</span>
              <span>{assets.length} assets</span>
              <span style={{ color: openCount > 0 ? "var(--crm-accent)" : "var(--crm-taupe)" }}>
                {openCount} open {openCount === 1 ? "comment" : "comments"}
              </span>
              {project.archived && <span style={{ color: "hsl(0 60% 60%)" }}>· Archived</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              className="crm-btn crm-btn--ghost crm-btn--sm"
              onClick={copy}
              title={`Copy share link: ${shareUrl}`}
              aria-label="Copy share link"
              style={{ padding: 8 }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
            <a
              className="crm-btn crm-btn--ghost crm-btn--sm"
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              title="Open preview in new tab"
              aria-label="Open preview"
              style={{ padding: 8 }}
            >
              <ExternalLink size={14} />
            </a>
            <span style={{ width: 1, height: 22, background: "var(--crm-border-dark)", margin: "0 4px" }} />
            <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={toggleFeedback} title="Toggle client feedback">
              Feedback: {project.feedback_enabled ? "On" : "Off"}
            </button>
            <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={archiveProject} title={project.archived ? "Unarchive" : "Archive"}>
              {project.archived ? "Unarchive" : "Archive"}
            </button>
          </div>
        </div>
      </header>

      <Tabs defaultValue="pages" className="w-full">
        <TabsList style={{ background: "hsl(40 20% 97% / 0.04)", border: "1px solid var(--crm-border-dark)", borderRadius: 8, marginBottom: 18 }}>
          <TabsTrigger value="pages" style={{ fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase" }}>Pages</TabsTrigger>
          <TabsTrigger value="feedback" style={{ fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase" }}>
            Feedback Board {openCount > 0 && <span style={{ marginLeft: 6, color: "var(--crm-accent)" }}>· {openCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="files" style={{ fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase" }}>Files</TabsTrigger>
        </TabsList>

        <TabsContent value="pages">
      {/* Pages list */}
      <section style={{ marginBottom: 28 }}>
        {pages.length === 0 && (
          <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--crm-taupe)", fontSize: 14, border: "1px dashed var(--crm-border-dark)", borderRadius: 10 }}>
            No pages yet. Upload HTML files from the <strong style={{ color: "var(--crm-warm-white)" }}>Files</strong> tab.
          </div>
        )}

        {pages.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "grid", gap: 8 }}>
              {pages.map((f) => {
                const isEntry = f.path === project.entry_path;
                const url = `${base}/p/${project.slug}/${encodeURI(f.path)}`;
                return (
                  <div key={f.id} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 14px",
                    background: isEntry ? "hsl(30 25% 44% / 0.08)" : "hsl(40 20% 97% / 0.03)",
                    border: `1px solid ${isEntry ? "var(--crm-accent)" : "var(--crm-border-dark)"}`,
                    borderRadius: 8,
                  }}>
                    <button
                      onClick={() => setEntry(f.path)}
                      title={isEntry ? "Entry page" : "Set as entry page"}
                      style={{ background: "transparent", border: 0, color: isEntry ? "var(--crm-accent)" : "var(--crm-taupe)", cursor: "pointer", padding: 0 }}
                    >
                      <Star size={16} fill={isEntry ? "currentColor" : "none"} />
                    </button>
                    <FileText size={14} style={{ color: "var(--crm-stone)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: "var(--crm-warm-white)", fontSize: 15, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.path}</div>
                      <div style={{ color: "var(--crm-taupe)", fontSize: 13, marginTop: 2 }}>
                        {isEntry ? "Entry page · " : ""}{Math.ceil((f.size_bytes ?? 0) / 1024)} KB
                      </div>
                    </div>
                    <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => setAiEditPath(f.path)} title="Edit page with AI">
                      <Sparkles size={12} /> AI Edit
                    </button>
                    <a className="crm-btn crm-btn--ghost crm-btn--sm" href={url} target="_blank" rel="noreferrer">
                      <ExternalLink size={12} /> Preview
                    </a>
                    <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => deleteFile(f.path)} title="Delete">
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
        </TabsContent>

        <TabsContent value="files">
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 13, letterSpacing: "0.35em", textTransform: "uppercase", color: "var(--crm-taupe)", margin: 0 }}>Upload Files</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <input ref={fileInput} type="file" multiple
              // @ts-expect-error nonstandard
              webkitdirectory=""
              style={{ display: "none" }} onChange={(e) => uploadFiles(e.target.files, false)} />
            <input ref={zipInput} type="file" accept=".zip" style={{ display: "none" }} onChange={(e) => uploadFiles(e.target.files, true)} />
            <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
              <Upload size={12} /> Folder
            </button>
            <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => zipInput.current?.click()} disabled={uploading}>
              <Upload size={12} /> .zip
            </button>
          </div>
        </div>

        {/* Dropzone */}
        <div
          ref={dropzone}
          onDragOver={(e) => { e.preventDefault(); dropzone.current?.classList.add("is-drag"); }}
          onDragLeave={() => dropzone.current?.classList.remove("is-drag")}
          onDrop={onDrop}
          style={{
            border: "1px dashed var(--crm-border-dark)",
            borderRadius: 10,
            padding: "18px 16px",
            textAlign: "center",
            color: "var(--crm-taupe)",
            fontSize: 14,
            marginBottom: 22,
            transition: "border-color 200ms",
          }}
        >
          {uploading ? "Uploading…" : "Drop files, a folder, or a .zip here to upload"}
        </div>

        <h2 style={{ fontSize: 13, letterSpacing: "0.35em", textTransform: "uppercase", color: "var(--crm-taupe)", margin: "0 0 14px" }}>Assets & Missing References</h2>

        {/* Assets (collapsible) */}
        {assets.length > 0 && (
          <div>
            <button
              onClick={() => setAssetsOpen((o) => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                background: "hsl(40 20% 97% / 0.03)", border: "1px solid var(--crm-border-dark)",
                borderRadius: 8, padding: "10px 14px", color: "var(--crm-warm-white)", cursor: "pointer", textAlign: "left",
              }}
            >
              {assetsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Box size={14} style={{ color: "var(--crm-taupe)" }} />
              <span style={{ fontSize: 15 }}>Assets ({assets.length})</span>
              <span style={{ marginLeft: "auto", color: "var(--crm-taupe)", fontSize: 13 }}>
                {Object.entries(assetCounts).map(([k, n]) => `${n} ${k}${n > 1 ? "s" : ""}`).join(" · ")}
              </span>
            </button>
            {assetsOpen && (
              <ul style={{ marginTop: 8, listStyle: "none", padding: 0, display: "grid", gap: 4, maxHeight: 320, overflowY: "auto" }}>
                {assets.map((f) => {
                  const cls = classify(f.path);
                  const Icon = cls === "image" ? ImageIcon : cls === "script" || cls === "style" ? Code2 : Box;
                  return (
                    <li key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", fontSize: 14, color: "var(--crm-stone)", borderRadius: 6 }}>
                      <Icon size={12} style={{ color: "var(--crm-taupe)", flexShrink: 0 }} />
                      <span style={{ flex: 1, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.path}</span>
                      <span style={{ color: "var(--crm-taupe)", flexShrink: 0 }}>{Math.ceil((f.size_bytes ?? 0) / 1024)} KB</span>
                      <button onClick={() => deleteFile(f.path)} title="Delete" style={{ background: "transparent", border: 0, color: "var(--crm-taupe)", cursor: "pointer", padding: 4 }}>
                        <Trash2 size={12} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Missing assets warning */}
        {missing.length > 0 && (
          <div style={{ marginTop: 14, padding: "12px 14px", background: "hsl(30 60% 50% / 0.08)", border: "1px solid hsl(30 60% 50% / 0.3)", borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "hsl(30 80% 70%)", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              <AlertTriangle size={14} /> {missing.length} missing asset reference{missing.length > 1 ? "s" : ""}
            </div>
            <div style={{ fontSize: 13, color: "var(--crm-stone)", marginBottom: 8 }}>
              These files are referenced in your HTML but missing. Map each one to an uploaded file to rename it so the page resolves.
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6, maxHeight: 280, overflowY: "auto" }}>
              {missing.slice(0, 50).map((m, i) => {
                const expected = m.ref.replace(/[?#].*$/, "").replace(/^\/+/, "");
                return (
                  <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontFamily: "monospace", color: "var(--crm-stone)", flexWrap: "wrap" }}>
                    <span style={{ color: "hsl(30 80% 70%)" }}>{m.ref}</span>
                    <span style={{ color: "var(--crm-taupe)" }}>· in {m.in_page}</span>
                    <select
                      className="crm-input"
                      defaultValue=""
                      onChange={async (e) => {
                        const from = e.target.value;
                        if (!from) return;
                        e.target.value = "";
                        const { error } = await supabase.functions.invoke("preview-admin", {
                          body: { action: "file_rename", project_id: id, from_path: from, to_path: expected },
                        });
                        if (error) { toast.error(error.message); return; }
                        toast.success(`Renamed to ${expected}`);
                        await load();
                        await loadMissing();
                      }}
                      style={{ fontSize: 13, padding: "4px 6px", marginLeft: "auto", maxWidth: 280 }}
                    >
                      <option value="">Map to uploaded file…</option>
                      {files.map((f: any) => (
                        <option key={f.path} value={f.path}>{f.path}</option>
                      ))}
                    </select>
                  </li>
                );
              })}
              {missing.length > 50 && <li style={{ fontSize: 13, color: "var(--crm-taupe)" }}>+{missing.length - 50} more…</li>}
            </ul>
          </div>
        )}
      </section>
        </TabsContent>

        <TabsContent value="feedback">
      {/* Feedback Kanban */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
          <h2 style={{ fontSize: 13, letterSpacing: "0.35em", textTransform: "uppercase", color: "var(--crm-taupe)", margin: 0 }}>
            Feedback Board
          </h2>
          {distinctPages.length > 1 && (
            <select
              className="crm-input"
              value={pageFilter}
              onChange={(e) => setPageFilter(e.target.value)}
              style={{ width: 240, fontSize: 14, padding: "6px 10px" }}
            >
              <option value="__all__">All pages ({comments.length})</option>
              {distinctPages.map((p) => (
                <option key={p} value={p}>{p} ({comments.filter((c) => c.page_path === p).length})</option>
              ))}
            </select>
          )}
        </div>

        {comments.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--crm-taupe)", border: "1px dashed var(--crm-border-dark)", borderRadius: 10, fontSize: 15 }}>
            No feedback yet. Share the link above so your client can leave pin comments.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
            {COLUMNS.map((col) => (
              <div
                key={col.key}
                onDragOver={(e) => { e.preventDefault(); setDragOver(col.key); }}
                onDragLeave={() => setDragOver((d) => (d === col.key ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const cid = e.dataTransfer.getData("text/comment-id");
                  if (cid) setStatus(cid, col.key);
                }}
                style={{
                  background: dragOver === col.key ? "hsl(30 25% 44% / 0.15)" : "hsl(40 20% 97% / 0.03)",
                  border: `1px solid ${dragOver === col.key ? "var(--crm-accent)" : "var(--crm-border-dark)"}`,
                  borderRadius: 10,
                  padding: 12,
                  minHeight: 200,
                  transition: "background 150ms, border-color 150ms",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-warm-white)" }}>{col.title}</span>
                  <span style={{ fontSize: 13, color: "var(--crm-taupe)" }}>{cardsByStatus[col.key].length}</span>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {cardsByStatus[col.key].map((c) => {
                    const replyCount = (repliesByComment[c.id] || []).length;
                    return (
                      <div
                        key={c.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/comment-id", c.id)}
                        onClick={() => { setActiveComment(c); setReplyText(""); }}
                        style={{
                          background: "var(--crm-ink)",
                          border: "1px solid var(--crm-border-dark)",
                          borderRadius: 8,
                          padding: 10,
                          cursor: "grab",
                          transition: "border-color 150ms",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: "var(--crm-accent)", fontWeight: 600, letterSpacing: "0.05em" }}>#{c.pin_number}</span>
                          <span style={{ fontSize: 12, color: "var(--crm-taupe)" }}>{timeAgo(c.created_at)}</span>
                        </div>
                        <div style={{ fontSize: 14, color: "var(--crm-warm-white)", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {c.body}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 12, color: "var(--crm-taupe)" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>
                            {c.author_name || "Guest"} · {c.page_path}
                          </span>
                          {replyCount > 0 && <span>{replyCount} {replyCount === 1 ? "reply" : "replies"}</span>}
                        </div>
                      </div>
                    );
                  })}
                  {cardsByStatus[col.key].length === 0 && (
                    <div style={{ fontSize: 13, color: "var(--crm-taupe)", textAlign: "center", padding: "20px 0" }}>—</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
        </TabsContent>
      </Tabs>
      </div>

      {/* Comment drawer */}
      {activeComment && (
        <div
          onClick={() => setActiveComment(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 50 }}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: 0, right: 0, bottom: 0, width: "min(480px, 100vw)",
              background: "var(--crm-ink)", borderLeft: "1px solid var(--crm-border-dark)",
              display: "flex", flexDirection: "column", padding: 24, gap: 14, overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-accent)" }}>
                  Pin #{activeComment.pin_number}
                </div>
                <div style={{ fontSize: 13, color: "var(--crm-taupe)", marginTop: 2 }}>
                  {activeComment.author_name || "Guest"} · {activeComment.page_path} · {new Date(activeComment.created_at).toLocaleString()}
                </div>
              </div>
              <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => setActiveComment(null)}>Close</button>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {COLUMNS.map((col) => {
                const active = (activeComment.status === col.key) || (col.key === "open" && activeComment.status !== "in_progress" && activeComment.status !== "resolved");
                return (
                  <button
                    key={col.key}
                    className={`crm-btn ${active ? "crm-btn--bronze" : "crm-btn--ghost"} crm-btn--sm`}
                    onClick={() => setStatus(activeComment.id, col.key)}
                  >
                    {col.title}
                  </button>
                );
              })}
              <button className="crm-btn crm-btn--ghost crm-btn--sm" style={{ marginLeft: "auto" }} onClick={() => deleteComment(activeComment.id)}>
                <Trash2 size={12} /> Delete
              </button>
            </div>

            <div style={{ background: "hsl(40 20% 97% / 0.04)", borderRadius: 8, padding: 14, fontSize: 16, color: "var(--crm-warm-white)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {activeComment.body}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(repliesByComment[activeComment.id] || []).map((r) => (
                <div key={r.id} style={{
                  padding: "10px 12px", borderRadius: 8, fontSize: 15,
                  background: r.is_admin ? "var(--crm-accent)" : "hsl(40 20% 97% / 0.06)",
                  color: r.is_admin ? "var(--crm-warm-white)" : "var(--crm-stone)",
                }}>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {r.author_name || (r.is_admin ? "Admin" : "Guest")}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{r.body}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea
                className="crm-input"
                placeholder="Write a reply…"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                style={{ minHeight: 80, resize: "vertical" }}
              />
              <button className="crm-btn crm-btn--primary" onClick={sendReply} disabled={!replyText.trim()}>
                Send reply
              </button>
            </div>
          </aside>
        </div>
      )}

      <AiEditDialog
        open={!!aiEditPath}
        onOpenChange={(v) => { if (!v) setAiEditPath(null); }}
        projectId={project.id}
        pagePath={aiEditPath ?? ""}
        onApplied={load}
      />
    </AdminLayout>
  );
}
