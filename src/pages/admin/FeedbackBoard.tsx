// The feedback board for one client project, laid out to the Admin
// Journeys canvas and working the way SureFeedback does: click anywhere
// on the page to drop a numbered pin, the pin carries a comment, the
// comment has a status you change by clicking it.
//
// The machinery was already here and had no screen. preview_comments has
// carried pin_number, page_path, x_pct, y_pct and status since the
// preview feature shipped, and preview-comments is a working API over it
// — but the only thing that ever wrote a pin was the embed script running
// inside a client's preview. There was no way to see a board, and no way
// to answer one.
//
// The board is per client project: every preview project under it, every
// page under those, one list. Pins are stored as percentages of the
// rendered page, so they stay on the thing they point at when the window
// changes size — see clickToPct.
//
// Reads and writes go direct to Supabase under admin RLS rather than
// through the preview-comments function. That function is the PUBLIC
// path, scoped to one page of one slug at a time and gated on
// feedback_enabled; this page needs every page of every preview at once,
// and needs to answer a comment the client cannot see yet.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { MessageSquare, MousePointer2, CheckCircle2, EyeOff, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import EmptyState from "@/components/admin/cv/EmptyState";
import {
  bucketByPage, filterComments, openCount, authorInitials, clickToPct, pageTitle,
  sortPages, visibleTo, pageKey, normaliseStatus, NEXT_STATUS, STATUS_LABEL, STATUS_CLASS,
  type BoardPage, type BoardComment, type FeedbackStatus,
} from "@/lib/feedbackBoard";

type Tool = "comment" | "browse";
type Tab = "comments" | "pages" | "activity";

interface PreviewProject {
  id: string; name: string; slug: string; entry_path: string;
  source_type: string; external_base_url: string | null; feedback_enabled: boolean;
}

export default function FeedbackBoard() {
  const { id: clientId, projectId } = useParams<{ id: string; projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAdminAuth();

  const [projectName, setProjectName] = useState("");
  const [previews, setPreviews] = useState<PreviewProject[]>([]);
  const [pages, setPages] = useState<BoardPage[]>([]);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [selectedComment, setSelectedComment] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("comment");
  const [showResolved, setShowResolved] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [asClient, setAsClient] = useState(false);
  const [tab, setTab] = useState<Tab>("comments");
  const [query, setQuery] = useState("");

  /** Where a click landed, while the composer for it is open. */
  const [draft, setDraft] = useState<{ x_pct: number; y_pct: number; body: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const proj = await supabase.from("client_projects").select("name").eq("id", projectId).maybeSingle();
    setProjectName(proj.data?.name ?? "Project");

    const { data: pvs, error } = await supabase.from("preview_projects")
      .select("id, name, slug, entry_path, source_type, external_base_url, feedback_enabled")
      .eq("client_project_id", projectId).eq("archived", false)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    const previewRows = (pvs ?? []) as PreviewProject[];
    setPreviews(previewRows);

    const ids = previewRows.map((p) => p.id);
    if (!ids.length) { setPages([]); setComments([]); setLoading(false); return; }

    const [files, external, cmts] = await Promise.all([
      supabase.from("preview_files")
        .select("project_id, path, label, group_label, order_index, visible_to_client, content_type")
        .in("project_id", ids),
      supabase.from("preview_external_pages")
        .select("project_id, path, label, group_label, order_index, visible_to_client")
        .in("project_id", ids),
      supabase.from("preview_comments")
        .select("id, project_id, page_path, pin_number, x_pct, y_pct, author_name, body, status, created_at")
        .in("project_id", ids).order("pin_number", { ascending: true }),
    ]);
    for (const r of [files, external, cmts]) if (r.error) toast.error(r.error.message);

    const nameOf = new Map(previewRows.map((p) => [p.id, p.name]));
    const built: BoardPage[] = [
      // Only pages, not every asset: preview_files holds the images and
      // stylesheets too, and a stylesheet is not a thing to comment on.
      ...((files.data ?? []) as Array<Record<string, unknown>>)
        .filter((f) => /\.html?$/i.test(String(f.path)))
        .map((f) => row(f, nameOf, false)),
      ...((external.data ?? []) as Array<Record<string, unknown>>).map((f) => row(f, nameOf, true)),
    ];
    setPages(sortPages(built));
    setComments((cmts.data ?? []) as BoardComment[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const shownPages = useMemo(() => visibleTo(pages, asClient), [pages, asClient]);
  useEffect(() => {
    if (!shownPages.length) { setSelectedPage(null); return; }
    if (!shownPages.some((p) => p.key === selectedPage)) setSelectedPage(shownPages[0].key);
  }, [shownPages, selectedPage]);

  const page = shownPages.find((p) => p.key === selectedPage) ?? null;
  const preview = previews.find((p) => p.id === page?.previewId) ?? null;
  const pagePins = useMemo(
    () => (page ? comments.filter((c) => pageKey(c.project_id, c.page_path) === page.key) : []),
    [comments, page],
  );
  const visiblePins = useMemo(
    () => filterComments(pagePins, { showResolved }),
    [pagePins, showResolved],
  );
  const buckets = useMemo(() => bucketByPage(shownPages, comments), [shownPages, comments]);

  const pageUrl = page && preview
    ? (page.external
      ? `${preview.external_base_url ?? ""}${page.path}`
      : `${window.location.origin}/p/${preview.slug}/${page.path}`)
    : null;

  const onStageClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDraft({ ...clickToPct(e.clientX, e.clientY, rect), body: "" });
    setSelectedComment(null);
  };

  const saveDraft = async () => {
    if (!draft || !page) return;
    const body = draft.body.trim();
    if (!body) { toast.error("Write the comment first"); return; }
    setSaving(true);
    try {
      // next_preview_pin keeps numbering per preview project, so pin 1 on
      // Desktop and pin 1 on Mobile are different pins and neither
      // renumbers when the other gains one.
      const { data: pin, error: pinErr } = await supabase.rpc("next_preview_pin", { _project_id: page.previewId });
      if (pinErr) throw pinErr;
      const { error } = await supabase.from("preview_comments").insert({
        project_id: page.previewId,
        page_path: page.path,
        // The embed script records a CSS selector; a pin dropped here has
        // no element behind it, so the position is the whole record.
        selector: "",
        x_pct: draft.x_pct, y_pct: draft.y_pct,
        author_name: user?.email ?? "Cre8 Visions",
        body,
        pin_number: pin as number,
        status: "open",
      });
      if (error) throw error;
      setDraft(null);
      await load();
      toast.success("Comment added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that comment");
    } finally {
      setSaving(false);
    }
  };

  const cycleStatus = async (c: BoardComment) => {
    const next = NEXT_STATUS[normaliseStatus(c.status)];
    // Optimistic: a status pill that waits on a round trip feels broken,
    // and the reload below puts it right if the write failed.
    setComments((cs) => cs.map((x) => (x.id === c.id ? { ...x, status: next } : x)));
    const { error } = await supabase.from("preview_comments")
      .update({ status: next, updated_at: new Date().toISOString() }).eq("id", c.id);
    if (error) { toast.error(error.message); await load(); }
  };

  const remove = async (c: BoardComment) => {
    if (!confirm(`Delete comment ${c.pin_number}? This cannot be undone.`)) return;
    const { error } = await supabase.from("preview_comments").delete().eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    setSelectedComment(null);
    await load();
  };

  const close = () => navigate(`/admin/clients/${clientId}/projects/${projectId}`);

  return (
    <div className="cv-admin cv-fb">
      <header className="cv-fb__bar">
        <button type="button" onClick={close}
          style={{ background: "none", border: 0, font: "inherit", fontSize: 14, color: "var(--cv-muted)", cursor: "pointer", padding: "12px 0" }}>
          ← {projectName}
        </button>
        <span style={{ fontWeight: 600, fontSize: 17 }}>Feedback board</span>
        {preview && !preview.feedback_enabled && (
          <span className="cv-chip cv-chip--amber">Commenting is off for clients on this preview</span>
        )}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: "var(--cv-muted)" }}>Viewing as</span>
        <span className="cv-viewseg" role="group" aria-label="Viewing as">
          <button type="button" className={`cv-viewseg__btn ${asClient ? "" : "cv-viewseg__btn--on"}`} onClick={() => setAsClient(false)}>You</button>
          <button type="button" className={`cv-viewseg__btn ${asClient ? "cv-viewseg__btn--on" : ""}`} onClick={() => setAsClient(true)}>Client</button>
        </span>
        <button type="button" className="cv-open" style={{ padding: "0 18px" }} onClick={close} aria-label="Close feedback board">
          Close <X size={15} style={{ marginLeft: 6 }} />
        </button>
      </header>

      <div className="cv-fb__body">
        <section className="cv-fb__stage">
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 600 }}>{page ? pageTitle(page) : "No page"}</span>
            <span style={{ fontSize: 13, color: "var(--cv-muted)" }}>
              {tool === "comment"
                ? "Click anywhere on the page to leave a comment"
                : "Browsing — switch to Comment to leave one"}
            </span>
          </div>

          <div className="cv-fb__page" ref={stageRef}>
            {loading ? (
              <div className="cv-fb__empty">Loading…</div>
            ) : !page ? (
              <div className="cv-fb__empty">
                No preview pages on this project yet. Upload or crawl one from the
                project's Files tab and its pages appear here.
              </div>
            ) : (
              <>
                <iframe
                  key={page.key}
                  src={pageUrl ?? undefined}
                  title={pageTitle(page)}
                  sandbox="allow-scripts allow-same-origin allow-popups"
                  referrerPolicy="no-referrer"
                  // Clicks must reach the catcher above, not the page —
                  // otherwise the first link in the design navigates the
                  // frame away instead of dropping a pin.
                  style={{ pointerEvents: tool === "comment" ? "none" : "auto" }}
                />
                {tool === "comment" && (
                  <button type="button" className="cv-fb__catch" aria-label="Add a comment at this spot" onClick={onStageClick} />
                )}

                {showPins && visiblePins.map((c) => {
                  const s = normaliseStatus(c.status);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`cv-pin ${s === "resolved" ? "cv-pin--done" : ""} ${selectedComment === c.id ? "cv-pin--sel" : ""}`}
                      style={{ left: `${c.x_pct}%`, top: `${c.y_pct}%` }}
                      aria-label={`Comment ${c.pin_number}`}
                      onClick={() => { setSelectedComment(c.id); setTab("comments"); }}
                    >
                      {c.pin_number}
                    </button>
                  );
                })}

                {draft && (
                  <>
                    <span className="cv-pin cv-pin--new" style={{ left: `${draft.x_pct}%`, top: `${draft.y_pct}%` }} aria-hidden="true">+</span>
                    <div
                      className="cv-card cv-card-pad"
                      style={{
                        position: "absolute", left: `min(${draft.x_pct}%, calc(100% - 320px))`,
                        top: `calc(${draft.y_pct}% + 26px)`, width: 300, zIndex: 3,
                        display: "flex", flexDirection: "column", gap: 10,
                      }}
                    >
                      <textarea
                        className="cv-textarea" rows={3} autoFocus value={draft.body}
                        onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                        placeholder="What needs changing here?"
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 16px" }} disabled={saving} onClick={saveDraft}>
                          {saving ? "Saving…" : "Comment"}
                        </button>
                        <button type="button" className="cv-open" style={{ padding: "0 16px" }} onClick={() => setDraft(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div className="cv-fb__tools">
                  <button type="button" className={`cv-tool cv-tool--wide ${tool === "comment" ? "cv-tool--on" : ""}`}
                    onClick={() => setTool("comment")}>
                    <MessageSquare size={16} /> COMMENT
                  </button>
                  <button type="button" className={`cv-tool ${tool === "browse" ? "cv-tool--on" : ""}`}
                    onClick={() => { setTool("browse"); setDraft(null); }}
                    aria-label="Browse the page without commenting" title="Browse the page without commenting">
                    <MousePointer2 size={18} />
                  </button>
                  <button type="button" className={`cv-tool ${showResolved ? "cv-tool--on" : ""}`}
                    onClick={() => setShowResolved((v) => !v)}
                    aria-label="Show resolved comments" title="Show resolved comments">
                    <CheckCircle2 size={18} />
                  </button>
                  <button type="button" className={`cv-tool ${showPins ? "" : "cv-tool--on"}`}
                    onClick={() => setShowPins((v) => !v)}
                    aria-label="Hide pins" title="Hide pins">
                    <EyeOff size={18} />
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        <aside className="cv-fb__rail">
          <div className="cv-fb__tabs">
            {(["comments", "pages", "activity"] as Tab[]).map((t) => (
              <button key={t} type="button" className={`cv-ptab ${tab === t ? "cv-ptab--on" : ""}`} onClick={() => setTab(t)}>
                {t === "comments" ? "Comments" : t === "pages" ? "Pages" : "Activity"}
              </button>
            ))}
          </div>

          <div className="cv-fb__railbody">
            {tab === "comments" && (
              <>
                <label className="cv-search" style={{ borderRadius: 12, minHeight: 46 }}>
                  <Search size={18} aria-hidden="true" />
                  <span className="sr-only">Search comments</span>
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search comments..." />
                </label>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 13, alignItems: "center" }}>
                  <span className="cv-chip" style={{ background: "var(--cv-ink)", color: "#fff" }}>All pages</span>
                  <button type="button" className={`cv-chip ${showResolved ? "cv-s-done" : ""}`}
                    style={showResolved ? undefined : { background: "var(--cv-card)", color: "var(--cv-tone-gray-fg)" }}
                    onClick={() => setShowResolved((v) => !v)}>
                    {showResolved ? "Status: all" : "Status: open"}
                  </button>
                  <span style={{ flex: 1 }} />
                  <span style={{ color: "var(--cv-muted)" }}>{openCount(comments)} open</span>
                </div>

                {!buckets.length ? (
                  <EmptyState title="No pages yet" subtitle="Add a preview to this project and its pages appear here." />
                ) : buckets.map(({ page: pg, comments: all }) => {
                  const shown = filterComments(all, { query, showResolved });
                  return (
                    <div key={pg.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div className="cv-fb__grouphead">
                        <span style={{ flex: 1 }}>
                          <button type="button" onClick={() => setSelectedPage(pg.key)}
                            style={{ background: "none", border: 0, font: "inherit", cursor: "pointer", padding: 0, textAlign: "left",
                              color: pg.key === selectedPage ? "var(--cv-accent)" : "inherit" }}>
                            {pageTitle(pg)}
                          </button>
                        </span>
                        <span>{all.length} comment{all.length === 1 ? "" : "s"}</span>
                      </div>
                      {shown.map((c) => {
                        const s = normaliseStatus(c.status);
                        return (
                          <div key={c.id} className={`cv-cm ${selectedComment === c.id ? "cv-cm--sel" : ""}`}>
                            <span className="cv-cm__av">{authorInitials(c.author_name)}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                                <button type="button" className="cv-cm__num"
                                  onClick={() => { setSelectedPage(pg.key); setSelectedComment(c.id); }}
                                  aria-label={`Show pin ${c.pin_number} on the page`} style={{ border: 0, cursor: "pointer" }}>
                                  {c.pin_number}
                                </button>
                                <span style={{ fontWeight: 500, fontSize: 14 }}>{c.author_name || "Guest"}</span>
                                <span style={{ fontSize: 12, color: "var(--cv-muted)" }}>{timeAgo(c.created_at)}</span>
                              </div>
                              <div className="cv-cm__body">{c.body}</div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button type="button" className={`cv-chip ${STATUS_CLASS[s]}`} style={{ minHeight: 32, cursor: "pointer", border: 0 }}
                                  onClick={() => cycleStatus(c)}
                                  title="Click to change: Open → In progress → Resolved">
                                  {STATUS_LABEL[s]}
                                </button>
                                {!asClient && (
                                  <button type="button" className="cv-mini cv-mini--danger" style={{ minHeight: 32 }} onClick={() => remove(c)}>
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                <p style={{ margin: 0, fontSize: 12, color: "var(--cv-muted)" }}>
                  Click a status to change it: Open, In progress, Resolved.
                </p>
              </>
            )}

            {tab === "pages" && (
              !shownPages.length
                ? <EmptyState title="No pages" subtitle="Nothing to review on this project yet." />
                : shownPages.map((pg) => {
                  const n = comments.filter((c) => pageKey(c.project_id, c.page_path) === pg.key).length;
                  return (
                    <button key={pg.key} type="button" className={`cv-q ${pg.key === selectedPage ? "cv-q--on" : ""}`}
                      onClick={() => { setSelectedPage(pg.key); setTab("comments"); }}>
                      <span className="cv-q__who">
                        <b>{pageTitle(pg)}</b>
                        <small>{pg.path}{pg.visibleToClient ? "" : " · hidden from the client"}</small>
                      </span>
                      <span className={`cv-chip ${n ? "cv-chip--blue" : "cv-chip--gray"}`}>{n}</span>
                    </button>
                  );
                })
            )}

            {tab === "activity" && (
              <EmptyState
                title="Activity is not wired up yet"
                subtitle="Comments, replies and status changes will read here in order. For now the Comments tab is the record."
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function row(
  f: Record<string, unknown>, nameOf: Map<string, string>, external: boolean,
): BoardPage {
  const previewId = String(f.project_id);
  const path = String(f.path);
  return {
    key: pageKey(previewId, path),
    previewId,
    previewName: nameOf.get(previewId) ?? "Preview",
    path,
    label: (f.label as string) || path,
    group: (f.group_label as string) || null,
    external,
    visibleToClient: f.visible_to_client !== false,
    order: Number(f.order_index ?? 0),
  };
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
