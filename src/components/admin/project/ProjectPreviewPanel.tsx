// The preview, as the canvas draws it: the page tree on the left, the page you
// picked on the right, feedback under it.
//
// Not a rewrite of PreviewDetail — that page keeps its Feedback board, Files
// and Activity tabs and its own route. This is the project page's view of the
// same data: which pages exist, where each one stands, and what the client
// said about the one you are looking at.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, Copy, Check, ExternalLink, Folder,
  MessageSquare, MoreHorizontal, Upload, Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  T, PAGE_STATE_STYLE, pageState, groupSummary, folderOf,
} from "./projectPageTokens";
import Panel, { PanelButton, Pill } from "./PanelChrome";

interface FileRow {
  path: string; label: string | null; group_label: string | null;
  visible_to_client: boolean | null;
}
interface ExternalRow {
  id: string; path: string; label: string | null; order_index: number;
  group_label: string | null; visible_to_client: boolean | null;
}
interface PageComment {
  id: string; path: string; author_name: string | null; body: string; created_at: string;
}
interface PreviewProject {
  id: string; slug: string; name: string;
  external_base_url: string | null; entry_path: string | null;
}

/** One row in the tree, whichever table it came from. */
interface Page {
  key: string;
  path: string;
  label: string;
  folder: string;
  external: boolean;
  approved: boolean;
  comments: PageComment[];
}

export default function ProjectPreviewPanel({
  clientId, clientProjectId, projectName, clientLabel,
}: {
  clientId: string;
  clientProjectId: string;
  projectName: string;
  clientLabel?: string | null;
}) {
  const [preview, setPreview] = useState<PreviewProject | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [external, setExternal] = useState<ExternalRow[]>([]);
  const [pageComments, setPageComments] = useState<PageComment[]>([]);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const base = useMemo(() => window.location.origin, []);

  const load = useCallback(async () => {
    const { data: row } = await supabase
      .from("preview_projects")
      .select("id, slug, name, external_base_url, entry_path")
      .eq("client_project_id", clientProjectId)
      .maybeSingle();
    const p = (row as PreviewProject | null) ?? null;
    setPreview(p);
    if (!p) { setLoading(false); return; }

    const [{ data: detail }, { data: approvals }] = await Promise.all([
      supabase.functions.invoke("preview-admin", { body: { action: "get", id: p.id } }),
      supabase.from("preview_approvals").select("kind, path").eq("project_id", p.id),
    ]);
    setFiles((detail?.files ?? []) as FileRow[]);
    setExternal((detail?.external_pages ?? []) as ExternalRow[]);
    setPageComments((detail?.page_comments ?? []) as PageComment[]);
    // Keyed by path alone: the tree shows one row per page whichever table it
    // came from, so an approval on either kind marks that row approved.
    setApproved(new Set((approvals ?? []).map((a) => a.path as string)));
    setLoading(false);
  }, [clientProjectId]);

  useEffect(() => { setLoading(true); void load(); }, [load]);

  const pages: Page[] = useMemo(() => {
    const byPath = new Map<string, PageComment[]>();
    for (const c of pageComments) {
      if (!byPath.has(c.path)) byPath.set(c.path, []);
      byPath.get(c.path)!.push(c);
    }
    const rows: Page[] = [];
    // preview_files holds every uploaded asset — stylesheets, scripts, images
    // — not just pages. Listing those in the tree would bury three real pages
    // under forty. Same test PreviewDetail uses to split pages from assets.
    for (const f of files.filter((f) => /\.html?$/i.test(f.path))) {
      rows.push({
        key: `file:${f.path}`, path: f.path,
        label: f.label?.trim() || f.path.replace(/\.html?$/i, "").replace(/[-_/]+/g, " "),
        folder: folderOf(f.group_label), external: false,
        approved: approved.has(f.path), comments: byPath.get(f.path) ?? [],
      });
    }
    for (const e of external) {
      rows.push({
        key: `ext:${e.path}`, path: e.path,
        label: e.label?.trim() || e.path.replace(/^\//, "").replace(/[-_/]+/g, " ") || "Home",
        folder: folderOf(e.group_label), external: true,
        approved: approved.has(e.path), comments: byPath.get(e.path) ?? [],
      });
    }
    return rows;
  }, [files, external, pageComments, approved]);

  const folders = useMemo(() => {
    const map = new Map<string, Page[]>();
    for (const p of pages) {
      if (!map.has(p.folder)) map.set(p.folder, []);
      map.get(p.folder)!.push(p);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [pages]);

  // First page of the first folder, until you pick one. A panel that opens on
  // nothing makes you click before it tells you anything.
  useEffect(() => {
    if (selected || !pages.length) return;
    setSelected(pages[0].key);
  }, [pages, selected]);

  const current = pages.find((p) => p.key === selected) ?? null;
  const shareUrl = preview
    ? (preview.external_base_url || `${base}/p/${preview.slug}`)
    : "";

  const createPreview = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("preview-admin", {
        body: {
          action: "create", name: projectName, client_id: clientId,
          client_label: clientLabel ?? null, attach_to_project_id: clientProjectId,
        },
      });
      if (error || !data?.project) throw new Error(error?.message || "Failed to create preview");
      toast.success("Preview created");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${base}/portal/${clientId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return (
      <Panel title="Preview">
        <div style={{ padding: 28, color: T.muted, fontSize: 15 }}>Loading…</div>
      </Panel>
    );
  }

  if (!preview) {
    return (
      <Panel
        title="Preview"
        actions={
          <PanelButton primary onClick={() => void createPreview()} disabled={creating}>
            <Plus size={14} /> {creating ? "Creating…" : "Create preview"}
          </PanelButton>
        }
      >
        <div style={{ padding: 28, color: T.muted, fontSize: 15 }}>
          No preview attached to this project yet.
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Preview"
      meta={
        <span style={{ fontSize: 14, color: T.text2 }}>
          {pages.length} page{pages.length === 1 ? "" : "s"}
        </span>
      }
      actions={
        <>
          <PanelButton onClick={() => void copyLink()}>
            {copied ? <Check size={14} /> : <Copy size={14} />} Copy client link
          </PanelButton>
          <PanelButton onClick={() => window.open(`/admin/previews/${preview.id}`, "_blank")}>
            <Upload size={14} /> Add pages
          </PanelButton>
        </>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)" }}>
        {/* ---- the tree ---- */}
        <div style={{ borderRight: T.hairline, padding: "10px 0", minWidth: 0 }}>
          {!folders.length && (
            <div style={{ padding: "18px 20px", color: T.muted, fontSize: 15 }}>
              No pages yet. Add some from the preview page.
            </div>
          )}
          {folders.map(([name, items]) => {
            const open = openFolders[name] !== false;
            const approvedCount = items.filter((i) => pageState({
              approved: i.approved, comments: i.comments.length,
            }) === "approved").length;
            return (
              <div key={name}>
                <button
                  type="button"
                  onClick={() => setOpenFolders((o) => ({ ...o, [name]: !open }))}
                  aria-expanded={open}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "8px 20px", background: "transparent", border: "none",
                    cursor: "pointer", color: T.text, textAlign: "left",
                  }}
                >
                  {open ? <ChevronDown size={14} color={T.muted} /> : <ChevronRight size={14} color={T.muted} />}
                  <Folder size={14} color={T.muted} />
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{name}</span>
                  <span style={{ fontSize: 15, color: T.muted }}>
                    · {groupSummary(items.length, approvedCount)}
                  </span>
                </button>

                {open && items.map((p) => {
                  const st = pageState({ approved: p.approved, comments: p.comments.length });
                  const style = PAGE_STATE_STYLE[st];
                  const on = p.key === selected;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setSelected(p.key)}
                      aria-current={on}
                      style={{
                        display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10,
                        alignItems: "center", width: "100%", padding: "7px 20px 7px 42px",
                        background: on ? T.rowActive : "transparent",
                        borderLeft: `2px solid ${on ? T.bronze : "transparent"}`,
                        border: "none", borderLeftWidth: 2, borderLeftStyle: "solid",
                        borderLeftColor: on ? T.bronze : "transparent",
                        cursor: "pointer", textAlign: "left", color: T.text,
                      }}
                    >
                      <span style={{
                        fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {p.label}
                      </span>
                      <Pill fg={style.fg} bg={style.bg}>{style.label}</Pill>
                      <span style={{
                        fontSize: 14, color: T.muted, display: "inline-flex",
                        alignItems: "center", gap: 5, minWidth: 34, justifyContent: "flex-end",
                      }}>
                        {p.comments.length
                          ? <><MessageSquare size={13} /> {p.comments.length}</>
                          : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* ---- the page you picked ---- */}
        <div style={{ padding: "14px 18px", minWidth: 0 }}>
          {!current ? (
            <div style={{ color: T.muted, fontSize: 15 }}>Pick a page to see its feedback.</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14, color: T.muted }}>{current.folder} /</div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: T.text }}>{current.label}</div>
                </div>
                <a
                  href={current.external
                    ? `${preview.external_base_url ?? ""}${current.path}`
                    : `${base}/p/${preview.slug}/${current.path}`}
                  target="_blank" rel="noreferrer" title="Open the page"
                  style={{ color: T.muted, display: "inline-flex", padding: 4 }}
                >
                  <ExternalLink size={15} />
                </a>
                <a
                  href={`/admin/previews/${preview.id}`}
                  title="Everything about this preview"
                  style={{ color: T.muted, display: "inline-flex", padding: 4 }}
                >
                  <MoreHorizontal size={15} />
                </a>
              </div>

              <div style={{
                marginTop: 12, height: 150, borderRadius: 8,
                background: "repeating-linear-gradient(135deg, rgba(244,239,233,0.03) 0 8px, transparent 8px 16px)",
                border: T.hairline,
              }} />

              <div style={{ marginTop: 14, fontSize: 14, color: T.muted }}>
                Feedback · {current.comments.length}
              </div>

              {!current.comments.length ? (
                <p style={{ fontSize: 14, color: T.muted, margin: "10px 0 0" }}>
                  Nothing said about this page yet.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  {current.comments.slice(0, 2).map((c) => (
                    <div key={c.id} style={{ background: T.card, borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: T.text2 }}>
                          {c.author_name || "Client"}
                        </span>
                        <span style={{ fontSize: 14, color: T.text2 }}>
                          {new Date(c.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <p style={{ fontSize: 14, color: T.text, margin: "4px 0 0", lineHeight: 1.5 }}>
                        {c.body}
                      </p>
                    </div>
                  ))}
                  {current.comments.length > 2 && (
                    <a
                      href={`/admin/previews/${preview.id}`}
                      style={{ fontSize: 14, fontWeight: 500, color: T.text2, marginTop: 2 }}
                    >
                      View all {current.comments.length}
                    </a>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
