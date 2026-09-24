// The preview, as the canvas draws it: the page tree on the left, the page you
// picked on the right, feedback under it.
//
// Everything about a preview is reachable from here now. There used to be a
// second page at /admin/previews/:id holding Files, Activity, the feedback
// board and the settings that gate client access — so the panel could show you
// a problem and then send you somewhere else to do anything about it. That page
// is gone; its contents open in a side panel over this one.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, Copy, Check, ExternalLink, Eye, EyeOff, Folder,
  FolderPlus, Globe, Mail, MessageSquare, MoreHorizontal, Sparkles, Trash2,
  Upload,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import SidePanel from "@/components/admin/SidePanel";
import AiEditDialog from "@/components/admin/preview/AiEditDialog";
import PreviewDetail from "@/pages/admin/PreviewDetail";
import {
  T, PAGE_STATE_STYLE, pageState, groupSummary, folderOf,
} from "@/lib/cre8Design";
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
  hidden: boolean;
  approved: boolean;
  comments: PageComment[];
}

function RowIcon({
  title, onClick, danger, children,
}: {
  title: string; onClick: () => void; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 24, height: 24, borderRadius: 4, border: "none", background: "transparent",
        color: danger ? "rgb(206, 122, 108)" : T.muted, cursor: "pointer", padding: 0,
      }}
    >
      {children}
    </button>
  );
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

  const [moreOpen, setMoreOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupPicks, setGroupPicks] = useState<Set<string>>(new Set());
  const [aiPath, setAiPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [addMenu, setAddMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [crawlOpen, setCrawlOpen] = useState(false);
  const [crawlUrl, setCrawlUrl] = useState("");
  const [crawling, setCrawling] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);

  const [mailOpen, setMailOpen] = useState(false);
  const [contacts, setContacts] = useState<Array<{ id: string; name: string | null; email: string; is_primary: boolean }>>([]);
  const [contactId, setContactId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const addWrap = useRef<HTMLDivElement>(null);

  // Close the Add pages menu on an outside click, the way every other menu in
  // this admin does. A menu that traps you is worse than one more button.
  useEffect(() => {
    if (!addMenu) return;
    const onDown = (e: MouseEvent) => {
      if (addWrap.current && !addWrap.current.contains(e.target as Node)) setAddMenu(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAddMenu(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [addMenu]);

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
        hidden: f.visible_to_client === false,
        approved: approved.has(f.path), comments: byPath.get(f.path) ?? [],
      });
    }
    for (const e of external) {
      rows.push({
        key: `ext:${e.path}`, path: e.path,
        label: e.label?.trim() || e.path.replace(/^\//, "").replace(/[-_/]+/g, " ") || "Home",
        folder: folderOf(e.group_label), external: true,
        hidden: e.visible_to_client === false,
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

  const embedSnippet = preview
    ? `<script src="https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/preview-serve?slug=${preview.slug}&path=__pf_embed.js"></script>`
    : "";

  const pageUrl = (p: Page) => p.external
    ? `${preview?.external_base_url ?? ""}${p.path}`
    : `${base}/p/${preview?.slug}/${p.path}`;

  // --- row actions -----------------------------------------------------------
  //
  // Two tables behind one tree, so each of these has to know which it is
  // editing. Uploaded pages go through file_meta / file_delete; crawled ones
  // through external_pages_set, which takes the WHOLE list — so the edit is
  // always "send back every row with one of them changed or missing".

  const externalPayload = (mutate: (rows: ExternalRow[]) => ExternalRow[]) =>
    mutate(external).map((r) => ({
      path: r.path, label: r.label,
      group_label: r.group_label, visible_to_client: r.visible_to_client,
    }));

  const setVisibility = async (p: Page, visible: boolean) => {
    if (!preview) return;
    setBusy(true);
    const { error } = p.external
      ? await supabase.functions.invoke("preview-admin", {
        body: {
          action: "external_pages_set", project_id: preview.id,
          pages: externalPayload((rows) => rows.map((r) =>
            r.path === p.path ? { ...r, visible_to_client: visible } : r)),
        },
      })
      : await supabase.functions.invoke("preview-admin", {
        body: {
          action: "file_meta", project_id: preview.id,
          path: p.path, visible_to_client: visible,
        },
      });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(visible ? "Back on the client's list" : "Archived — the client cannot reach it");
    void load();
  };

  const remove = async (p: Page) => {
    if (!preview) return;
    if (!confirm(`Delete "${p.label}"? This cannot be undone.`)) return;
    setBusy(true);
    const { error } = p.external
      ? await supabase.functions.invoke("preview-admin", {
        body: {
          action: "external_pages_set", project_id: preview.id,
          pages: externalPayload((rows) => rows.filter((r) => r.path !== p.path)),
        },
      })
      : await supabase.functions.invoke("preview-admin", {
        body: { action: "file_delete", project_id: preview.id, path: p.path },
      });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (p.key === selected) setSelected(null);
    toast.success("Deleted");
    void load();
  };

  const saveGroup = async () => {
    if (!preview) return;
    const name = groupName.trim();
    if (!name) { toast.error("Name the group first"); return; }
    if (!groupPicks.size) { toast.error("Pick at least one page"); return; }
    setBusy(true);
    const picked = pages.filter((p) => groupPicks.has(p.key));
    const extPaths = new Set(picked.filter((p) => p.external).map((p) => p.path));

    // Uploaded pages are one call each; crawled ones are one call for the whole
    // list. Both, then reload once.
    const calls: Promise<unknown>[] = picked
      .filter((p) => !p.external)
      .map((p) => supabase.functions.invoke("preview-admin", {
        body: { action: "file_meta", project_id: preview.id, path: p.path, group_label: name },
      }));
    if (extPaths.size) {
      calls.push(supabase.functions.invoke("preview-admin", {
        body: {
          action: "external_pages_set", project_id: preview.id,
          pages: externalPayload((rows) => rows.map((r) =>
            extPaths.has(r.path) ? { ...r, group_label: name } : r)),
        },
      }));
    }
    await Promise.all(calls);
    setBusy(false);
    setGroupOpen(false);
    setGroupName("");
    setGroupPicks(new Set());
    toast.success(`Grouped ${picked.length} page${picked.length === 1 ? "" : "s"} under "${name}"`);
    void load();
  };

  // --- adding pages ----------------------------------------------------------

  const upload = async (list: FileList | null, asZip: boolean) => {
    if (!preview || !list?.length) return;
    setUploading(true);
    const id = toast.loading(asZip ? "Unpacking…" : `Uploading ${list.length} file${list.length === 1 ? "" : "s"}…`);
    try {
      const form = new FormData();
      form.append("project_id", preview.id);
      if (asZip) {
        form.append("zip", list[0]);
      } else {
        for (const f of Array.from(list)) {
          // A folder upload gives every file a webkitRelativePath beginning
          // with the folder's own name. Dropping that first segment is what
          // makes "site/index.html" upload as "index.html" — otherwise every
          // path gains a directory the preview does not serve from.
          const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
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
      toast.success(`Uploaded ${json.file_count} file${json.file_count === 1 ? "" : "s"}`, { id });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed", { id });
    } finally {
      setUploading(false);
      for (const r of [filesInput, folderInput, zipInput]) if (r.current) r.current.value = "";
    }
  };

  const crawl = async () => {
    if (!preview) return;
    const url = crawlUrl.trim();
    if (!url) { toast.error("Paste the site's address first"); return; }
    setCrawling(true);
    try {
      // The crawler reads the address off the project rather than taking one,
      // so a new address has to be saved before it can be followed.
      const { error: saveErr } = await supabase.functions.invoke("preview-admin", {
        body: { action: "update", id: preview.id, external_base_url: url },
      });
      if (saveErr) throw new Error(saveErr.message);

      const { data, error } = await supabase.functions.invoke("preview-admin", {
        body: { action: "crawl_external", id: preview.id },
      });
      if (error || data?.error) throw new Error(error?.message || data?.error || "Crawl failed");
      const found = data?.pages ?? [];
      if (!found.length) { toast.message("No pages discovered at that address."); return; }

      // Merge rather than replace: a page someone named or filed by hand
      // outranks whatever the crawler calls it this time round.
      const have = new Set(external.map((p) => p.path));
      await supabase.functions.invoke("preview-admin", {
        body: {
          action: "external_pages_set", project_id: preview.id,
          pages: [
            ...externalPayload((rows) => rows),
            ...found
              .filter((p: { path: string }) => !have.has(p.path))
              .map((p: { path: string; label?: string }) => ({ path: p.path, label: p.label ?? null })),
          ],
        },
      });
      toast.success(`Discovered ${found.length} page${found.length === 1 ? "" : "s"}`);
      setCrawlOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Crawl failed");
    } finally {
      setCrawling(false);
    }
  };

  // --- telling the client ----------------------------------------------------

  const openMail = async () => {
    setMailOpen(true);
    const { data: cp } = await supabase
      .from("client_projects").select("client_id").eq("id", clientProjectId).maybeSingle();
    if (!cp?.client_id) { toast.error("No client on this project."); return; }
    const { data: rows } = await supabase
      .from("client_contacts")
      .select("id, name, email, is_primary")
      .eq("client_id", cp.client_id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    const list = (rows ?? []).filter((c) => c.email) as typeof contacts;
    setContacts(list);
    setContactId((list.find((c) => c.is_primary) ?? list[0])?.id ?? null);
  };

  const sendMail = async () => {
    if (!preview || !contactId) { toast.error("Pick who it goes to."); return; }
    setSending(true);
    const id = toast.loading("Sending review email…");
    try {
      const { data, error } = await supabase.functions.invoke("send-preview-review-email", {
        body: { preview_project_id: preview.id, contact_id: contactId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Sent to ${data?.recipient ?? "the client"}`, { id, duration: 6000 });
      setMailOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send", { id, duration: 8000 });
    } finally {
      setSending(false);
    }
  };

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
            <Upload size={14} /> {creating ? "Creating…" : "Create preview"}
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
    <>
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
              {copied ? <Check size={14} /> : <Copy size={14} />} Copy portal link
            </PanelButton>
            <PanelButton onClick={() => void openMail()}>
              <Mail size={14} /> Send review email
            </PanelButton>
            <PanelButton
              onClick={() => { setGroupPicks(new Set()); setGroupName(""); setGroupOpen(true); }}
              disabled={!pages.length}
            >
              <FolderPlus size={14} /> New group
            </PanelButton>

            {/* A split button: the common case is the button, the rarer three
                are behind the arrow. Add pages opens the file picker straight
                away rather than opening a panel that then offers to open a
                file picker. */}
            <div ref={addWrap} style={{ position: "relative", display: "flex" }}>
              <PanelButton primary onClick={() => filesInput.current?.click()} disabled={uploading}>
                <Upload size={14} /> {uploading ? "Uploading…" : "Add pages"}
              </PanelButton>
              <button
                type="button"
                onClick={() => setAddMenu((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={addMenu}
                aria-label="More ways to add pages"
                style={{
                  marginLeft: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 28, borderRadius: T.radiusSm, border: "none",
                  background: T.text, color: "rgb(27, 25, 21)", cursor: "pointer",
                }}
              >
                <ChevronDown size={14} />
              </button>

              {addMenu && (
                <div role="menu" style={{
                  position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 40,
                  minWidth: 190, background: T.panel, border: T.hairline,
                  borderRadius: T.radiusSm, padding: "5px 0",
                  boxShadow: "0 18px 44px rgba(0,0,0,.5)",
                }}>
                  {[
                    { label: "Upload folder", icon: <Folder size={14} />, run: () => folderInput.current?.click() },
                    { label: "Upload zip", icon: <Upload size={14} />, run: () => zipInput.current?.click() },
                    { label: "Crawl pages", icon: <Globe size={14} />, run: () => setCrawlOpen(true) },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      onClick={() => { setAddMenu(false); item.run(); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 9, width: "100%",
                        padding: "8px 14px", fontSize: 14, textAlign: "left",
                        background: "transparent", border: "none", cursor: "pointer", color: T.text,
                      }}
                    >
                      {item.icon} {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <PanelButton onClick={() => setMoreOpen(true)} title="Feedback board and activity">
              <MoreHorizontal size={14} />
            </PanelButton>
          </>
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)" }}>
          {/* ---- the tree ---- */}
          <div style={{ borderRight: T.hairline, padding: "10px 0", minWidth: 0 }}>
            {!folders.length && (
              <div style={{ padding: "18px 20px", color: T.muted, fontSize: 15 }}>
                No pages yet. Add some with the button above.
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
                      <div
                        key={p.key}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelected(p.key)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelected(p.key); }}
                        aria-current={on}
                        style={{
                          display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 10,
                          alignItems: "center", padding: "5px 14px 5px 42px",
                          background: on ? T.rowActive : "transparent",
                          borderLeft: `2px solid ${on ? T.bronze : "transparent"}`,
                          cursor: "pointer", color: T.text,
                          opacity: p.hidden ? 0.55 : 1,
                        }}
                      >
                        <span style={{
                          fontSize: 15, overflow: "hidden", textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          textDecoration: p.hidden ? "line-through" : undefined,
                        }}>
                          {p.label}
                        </span>
                        <Pill fg={style.fg} bg={style.bg}>{style.label}</Pill>
                        <span style={{
                          fontSize: 14, color: T.muted, display: "inline-flex",
                          alignItems: "center", gap: 5, minWidth: 30, justifyContent: "flex-end",
                        }}>
                          {p.comments.length
                            ? <><MessageSquare size={13} /> {p.comments.length}</>
                            : "—"}
                        </span>

                        <span style={{ display: "inline-flex", gap: 1 }}>
                          <RowIcon title="Open the page" onClick={() => window.open(pageUrl(p), "_blank")}>
                            <ExternalLink size={13} />
                          </RowIcon>
                          {/* Only uploaded pages have a file to rewrite. A
                              crawled page lives on someone else's server. */}
                          {!p.external && (
                            <RowIcon title="Edit with AI" onClick={() => setAiPath(p.path)}>
                              <Sparkles size={13} />
                            </RowIcon>
                          )}
                          <RowIcon
                            title={p.hidden ? "Show the client this page" : "Archive — hide from the client"}
                            onClick={() => void setVisibility(p, p.hidden)}
                          >
                            {p.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                          </RowIcon>
                          <RowIcon title="Delete the page" danger onClick={() => void remove(p)}>
                            <Trash2 size={13} />
                          </RowIcon>
                        </span>
                      </div>
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
                    href={pageUrl(current)} target="_blank" rel="noreferrer" title="Open the page"
                    style={{ color: T.muted, display: "inline-flex", padding: 4 }}
                  >
                    <ExternalLink size={15} />
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
                      <button
                        type="button"
                        onClick={() => setMoreOpen(true)}
                        style={{
                          fontSize: 14, fontWeight: 500, color: T.text2, background: "none",
                          border: "none", padding: 0, cursor: "pointer", textAlign: "left", marginTop: 2,
                        }}
                      >
                        View all {current.comments.length}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Panel>

      {/* Everything the old /admin/previews/:id page held — uploads, files,
          the feedback board, activity, and the settings that gate client
          access — over the page rather than away from it. */}
      <input
        ref={filesInput} type="file" multiple hidden
        onChange={(e) => void upload(e.target.files, false)}
      />
      <input
        ref={folderInput} type="file" multiple hidden
        // @ts-expect-error — non-standard, and the only way to pick a folder.
        webkitdirectory="" directory=""
        onChange={(e) => void upload(e.target.files, false)}
      />
      <input
        ref={zipInput} type="file" accept=".zip" hidden
        onChange={(e) => void upload(e.target.files, true)}
      />

      <SidePanel
        open={moreOpen}
        onClose={() => { setMoreOpen(false); void load(); }}
        title="Preview"
        subtitle={preview.name}
        width={920}
      >
        <PreviewDetail overrideId={preview.id} embedded />
      </SidePanel>

      <SidePanel
        open={groupOpen}
        onClose={() => setGroupOpen(false)}
        title="New group"
        subtitle="Name it, then pick what goes in it."
        width={460}
        footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <PanelButton onClick={() => setGroupOpen(false)}>Cancel</PanelButton>
            <PanelButton primary onClick={() => void saveGroup()} disabled={busy}>
              {busy ? "Saving…" : "Create group"}
            </PanelButton>
          </div>
        }
      >
        <label className="crm-label" htmlFor="pv-group-name">Group name</label>
        <input
          id="pv-group-name"
          className="crm-input"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="Onboarding"
        />

        <div style={{ marginTop: 18, fontSize: 14, color: T.muted }}>
          Pages ({groupPicks.size} picked)
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
          {pages.map((p) => (
            <label
              key={p.key}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 2px",
                borderTop: T.hairline, fontSize: 15, color: T.text, cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={groupPicks.has(p.key)}
                onChange={(e) => setGroupPicks((s) => {
                  const next = new Set(s);
                  if (e.target.checked) next.add(p.key); else next.delete(p.key);
                  return next;
                })}
              />
              <span style={{ flex: 1, minWidth: 0 }}>{p.label}</span>
              <span style={{ fontSize: 13, color: T.muted }}>{p.folder}</span>
            </label>
          ))}
        </div>
      </SidePanel>

      <SidePanel
        open={crawlOpen}
        onClose={() => setCrawlOpen(false)}
        title="Crawl pages"
        subtitle="Point it at a site you have built and it finds the pages."
        width={520}
        footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <PanelButton onClick={() => setCrawlOpen(false)}>Cancel</PanelButton>
            <PanelButton primary onClick={() => void crawl()} disabled={crawling}>
              {crawling ? "Crawling…" : "Crawl"}
            </PanelButton>
          </div>
        }
      >
        <label className="crm-label" htmlFor="pv-crawl-url">Site address</label>
        <input
          id="pv-crawl-url"
          className="crm-input"
          value={crawlUrl}
          onChange={(e) => setCrawlUrl(e.target.value)}
          placeholder="https://example.lovable.app"
        />
        <p style={{ fontSize: 14, color: T.muted, margin: "8px 0 0", lineHeight: 1.5 }}>
          Pages already on the list keep the name and folder you gave them.
          Only new ones are added.
        </p>

        <hr style={{ border: 0, borderTop: T.hairline, margin: "22px 0 18px" }} />

        {/* The other half of a crawled site: discovering pages puts them on
            your list, but the client still cannot say anything ON one until
            this is in the site's own HTML. Both jobs, one panel. */}
        <div style={{ fontSize: 15, fontWeight: 500, color: T.text }}>
          Pin comments on the live site
        </div>
        <p style={{ fontSize: 14, color: T.muted, margin: "6px 0 10px", lineHeight: 1.5 }}>
          Paste this into the site's HTML once, before <code>&lt;/body&gt;</code>.
          The client then gets the same click-to-pin tool your uploaded previews
          have, on every page.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <code style={{
            flex: 1, minWidth: 0, fontSize: 13, fontFamily: "monospace", color: T.text2,
            background: T.card, borderRadius: 6, padding: "8px 10px",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {embedSnippet}
          </code>
          <PanelButton
            onClick={() => {
              void navigator.clipboard.writeText(embedSnippet);
              setSnippetCopied(true);
              setTimeout(() => setSnippetCopied(false), 1500);
            }}
          >
            {snippetCopied ? <Check size={14} /> : <Copy size={14} />}
          </PanelButton>
        </div>
      </SidePanel>

      <SidePanel
        open={mailOpen}
        onClose={() => setMailOpen(false)}
        title="Send review email"
        subtitle="A link to the portal, and a nudge to look at it."
        width={460}
        footer={
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <PanelButton onClick={() => setMailOpen(false)}>Cancel</PanelButton>
            <PanelButton primary onClick={() => void sendMail()} disabled={sending || !contactId}>
              {sending ? "Sending…" : "Send"}
            </PanelButton>
          </div>
        }
      >
        {!contacts.length ? (
          <p style={{ fontSize: 15, color: T.muted, margin: 0 }}>
            No contact on this client has an email address, so there is nobody to
            send to. Add one on the client's page first.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {contacts.map((c) => (
              <label
                key={c.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 2px",
                  borderTop: T.hairline, fontSize: 15, color: T.text, cursor: "pointer",
                }}
              >
                <input
                  type="radio" name="pv-contact" checked={contactId === c.id}
                  onChange={() => setContactId(c.id)}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  {c.name || c.email}
                  {c.is_primary && (
                    <span style={{ fontSize: 13, color: T.muted }}> · primary</span>
                  )}
                </span>
                <span style={{ fontSize: 13, color: T.muted }}>{c.email}</span>
              </label>
            ))}
          </div>
        )}
      </SidePanel>

      <AiEditDialog
        open={!!aiPath}
        onOpenChange={(v) => { if (!v) setAiPath(null); }}
        projectId={preview.id}
        pagePath={aiPath ?? ""}
        onApplied={load}
      />
    </>
  );
}
