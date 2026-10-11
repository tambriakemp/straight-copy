// The client's feedback board, laid out to board 17 of the Admin
// Journeys canvas: the page on the left, pins on it, the comment rail on
// the right.
//
// It is the admin board with the admin taken out — no Viewing-as toggle,
// no upload box, no delete, and the status pill is text rather than a
// button, because the status is what Cre8 Visions is doing about a
// comment and not something the person who left it sets. Everything it
// draws comes from the same pure module the admin board uses
// (@/lib/feedbackBoard), so the two cannot disagree about which comment
// belongs to which page.
//
// Reads and writes go through preview-approvals and preview-comments,
// which are the PUBLIC endpoints. The portal has no Supabase session —
// it is a link — so the admin board's direct, RLS-protected queries are
// not available here and must not be.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { MessageSquare, MousePointer2, CheckCircle2, EyeOff, Eye, Search, X, Check, Folder, Undo2 } from "lucide-react";
import EmptyState from "@/components/admin/cv/EmptyState";
import {
  filterComments, openCount, authorInitials, clickToPct, pageLabel, pageKind,
  foldersOf, sortPages, pageKey, normaliseStatus, STATUS_LABEL, STATUS_CLASS,
  approvalFor, buildActivity, APPROVAL_LABEL, APPROVAL_CLASS,
  type BoardPage, type BoardComment, type ApprovalRow, type ApprovalEvent,
} from "@/lib/feedbackBoard";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Tool = "comment" | "browse";
type Tab = "comments" | "pages" | "activity";

interface ProjectRow { id: string; type: string; name: string }

async function callFn(fn: string, body: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
    body: JSON.stringify(body),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((out as { error?: string }).error || "Request failed");
  return out as Record<string, unknown>;
}

/** What preview-approvals `list` hands back for one page. */
interface ApiPage {
  path: string;
  label: string | null;
  isExternal: boolean;
  viewUrl: string | null;
  group: string | null;
  approval: { approver_name: string | null; approved_at: string } | null;
}

export default function PortalFeedback() {
  const { clientId, projectId } = useParams<{ clientId: string; projectId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";

  const [clientName, setClientName] = useState("");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [current, setCurrent] = useState<string | null>(projectId ?? null);

  const [slug, setSlug] = useState<string | null>(null);
  const [pages, setPages] = useState<BoardPage[]>([]);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [approvals, setApprovals] = useState<Map<string, ApprovalRow>>(new Map());
  const [lastEvent, setLastEvent] = useState<Map<string, ApprovalEvent>>(new Map());
  const [events, setEvents] = useState<ApprovalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [noPreview, setNoPreview] = useState(false);

  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [selectedComment, setSelectedComment] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("comment");
  const [showResolved, setShowResolved] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [tab, setTab] = useState<Tab>("comments");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<{ x_pct: number; y_pct: number; body: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);

  // ---- who and what projects -------------------------------------------
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await callFn("brand-kit-intake", { clientId, action: "resolve" });
        if (cancelled) return;
        const c = data.client as { contact_name?: string; business_name?: string } | null;
        setClientName(c?.contact_name || c?.business_name || "");
        const rows = (Array.isArray(data.projects) ? data.projects : []) as ProjectRow[];
        const visible = rows.filter((p) => p.type !== "site_preview");
        setProjects(visible);
        setCurrent((v) => v ?? visible[0]?.id ?? null);
      } catch {
        if (!cancelled) setClientName("");
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  // ---- the board for the chosen project --------------------------------
  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    setNoPreview(false);
    try {
      const listed = await callFn("preview-approvals", { action: "list", client_project_id: current });
      const proj = listed.project as { id: string; slug: string; name: string };
      setSlug(proj.slug);

      const apiPages = (listed.pages ?? []) as ApiPage[];
      const built: BoardPage[] = apiPages.map((p) => ({
        key: pageKey(proj.id, p.path),
        previewId: proj.id,
        previewName: proj.name,
        path: p.path,
        label: p.label || p.path,
        group: p.group,
        external: p.isExternal,
        // `list` already drops anything hidden for a client caller, so
        // everything that arrives here is meant to be seen.
        visibleToClient: true,
        order: 0,
      }));
      setPages(sortPages(built));
      setApprovals(new Map(apiPages
        .filter((p) => p.approval)
        .map((p) => [pageKey(proj.id, p.path), {
          path: p.path, project_id: proj.id, approved_at: p.approval!.approved_at,
        }])));

      const [cRes, eRes] = await Promise.all([
        callFn("preview-approvals", { action: "comments", slug: proj.slug }).catch(() => null),
        callFn("preview-approvals", { action: "events", slug: proj.slug }).catch(() => null),
      ]);
      setComments(((cRes?.comments ?? []) as BoardComment[]));
      const evRows = ((eRes?.events ?? []) as ApprovalEvent[])
        .map((e) => ({ ...e, project_id: proj.id }));
      setEvents(evRows);
      const latest = new Map<string, ApprovalEvent>();
      for (const e of evRows) {
        const k = pageKey(proj.id, e.path);
        if (!latest.has(k)) latest.set(k, e);
      }
      setLastEvent(latest);
    } catch {
      // A project with no preview on it is the ordinary case, not a fault.
      setNoPreview(true);
      setPages([]); setComments([]); setEvents([]);
      setApprovals(new Map()); setLastEvent(new Map());
      setSlug(null);
    } finally {
      setLoading(false);
    }
  }, [current]);

  useEffect(() => { void load(); }, [load]);

  const folders = useMemo(() => foldersOf(pages), [pages]);
  const commentsOn = useCallback(
    (pg: BoardPage) => comments.filter((c) => pageKey(c.project_id, c.page_path) === pg.key),
    [comments],
  );

  useEffect(() => {
    if (!pages.length) { setSelectedPage(null); return; }
    if (!pages.some((p) => p.key === selectedPage)) setSelectedPage(pages[0].key);
  }, [pages, selectedPage]);

  const page = pages.find((p) => p.key === selectedPage) ?? null;
  const visiblePins = useMemo(
    () => (page ? filterComments(commentsOn(page), { showResolved }) : []),
    [page, commentsOn, showResolved],
  );
  const pageUrl = page && slug
    ? (page.external ? page.path : `${window.location.origin}/p/${slug}/${page.path}`)
    : null;

  const titleFor = useCallback((pid: string, path: string) => {
    const pg = pages.find((x) => x.key === pageKey(pid, path));
    return pg ? pageLabel(pg) : path;
  }, [pages]);
  const activity = useMemo(() => buildActivity(events, comments, titleFor), [events, comments, titleFor]);

  // ---- writes ----------------------------------------------------------
  const saveDraft = async () => {
    if (!draft || !page || !slug) return;
    const body = draft.body.trim();
    if (!body) { toast.error("Write the comment first"); return; }
    setSaving(true);
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/preview-comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
        body: JSON.stringify({
          slug, page_path: page.path,
          // The public endpoint requires a selector — it was written for
          // the in-page widget, which had an element to name. A pin
          // dropped on a frame has none, so the position is the record.
          selector: "body",
          x_pct: draft.x_pct, y_pct: draft.y_pct,
          author_name: clientName || "Guest",
          body,
        }),
      }).then(async (r) => {
        const out = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error((out as { error?: string }).error || "Could not save that comment");
      });
      setDraft(null);
      await load();
      toast.success("Comment added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that comment");
    } finally {
      setSaving(false);
    }
  };

  const approve = async (pg: BoardPage) => {
    if (!slug) return;
    setBusy(pg.key);
    try {
      await callFn("preview-approvals", {
        action: "approve", slug, kind: "page", path: pg.path, approver_name: clientName || null,
      });
      await load();
      toast.success(`${pageLabel(pg)} approved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not approve that page");
    } finally { setBusy(null); }
  };

  const undoApproval = async (pg: BoardPage) => {
    if (!slug) return;
    setBusy(pg.key);
    try {
      await callFn("preview-approvals", {
        action: "unapprove", slug, kind: "page", path: pg.path, approver_name: clientName || null,
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not undo that");
    } finally { setBusy(null); }
  };

  const requestChanges = async (pg: BoardPage) => {
    if (!slug) return;
    const note = reason.trim();
    if (!note) { toast.error("Say what needs changing"); return; }
    setBusy(pg.key);
    try {
      await callFn("preview-approvals", {
        action: "changes_requested", slug, kind: "page", path: pg.path,
        note, approver_name: clientName || null,
      });
      setRejecting(null); setReason("");
      await load();
      toast.success("Sent back with your note");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record that");
    } finally { setBusy(null); }
  };

  const close = () => navigate(`/portal/${clientId}${qs}`);

  return (
    <div className="cv-admin cv-fb">
      <header className="cv-fb__bar">
        <Link to={`/portal/${clientId}${qs}`}
          style={{ fontSize: 14, color: "var(--cv-muted)", textDecoration: "none", padding: "12px 0" }}>
          ← Back to portal
        </Link>
        <span style={{ fontWeight: 600, fontSize: 17 }}>Feedback board</span>
        {projects.length > 1 && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--cv-muted)" }}>
            Project
            <select className="cv-select" value={current ?? ""}
              onChange={(e) => { setCurrent(e.target.value); setSelectedPage(null); setDraft(null); }}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <span style={{ flex: 1 }} />
        {clientName && <span style={{ fontSize: 14, color: "var(--cv-muted)" }}>{clientName}</span>}
        <button type="button" className="cv-open" style={{ padding: "0 18px" }} onClick={close}
          aria-label="Close feedback board">
          Close <X size={15} style={{ marginLeft: 6 }} />
        </button>
      </header>

      <div className="cv-fb__body">
        <section className="cv-fb__stage">
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 600 }}>{page ? pageLabel(page) : "No page"}</span>
            <span style={{ fontSize: 13, color: "var(--cv-muted)", flex: 1 }}>
              {tool === "comment"
                ? "Click anywhere on the page to leave a comment"
                : "Browsing — switch to Comment to leave one"}
            </span>
            {page && (() => {
              const a = approvalFor(page.key, approvals, lastEvent);
              return (
                <>
                  <span className={`cv-chip ${APPROVAL_CLASS[a.state]}`}>{APPROVAL_LABEL[a.state]}</span>
                  {a.state === "approved" ? (
                    <button type="button" className="cv-mini" disabled={busy === page.key}
                      onClick={() => undoApproval(page)}>
                      <Undo2 size={14} style={{ marginRight: 6 }} /> Undo approval
                    </button>
                  ) : (
                    <>
                      <button type="button" className="cv-open cv-open--go" style={{ padding: "0 16px", minHeight: 40 }}
                        disabled={busy === page.key} onClick={() => approve(page)}>
                        <Check size={15} style={{ marginRight: 6 }} /> Looks good
                      </button>
                      <button type="button" className="cv-mini"
                        onClick={() => { setRejecting(rejecting === page.key ? null : page.key); setReason(a.note ?? ""); }}>
                        Needs changes
                      </button>
                    </>
                  )}
                </>
              );
            })()}
          </div>

          {page && rejecting === page.key && (
            <div className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label className="cv-field">
                What needs changing on this page?
                <textarea className="cv-textarea" rows={3} autoFocus value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="The logo is the old one, and the phone number is out of date." />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 16px" }}
                  disabled={busy === page.key} onClick={() => requestChanges(page)}>
                  {busy === page.key ? "Sending…" : "Send to Cre8 Visions"}
                </button>
                <button type="button" className="cv-open" style={{ padding: "0 16px" }}
                  onClick={() => { setRejecting(null); setReason(""); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="cv-fb__page" ref={stageRef}>
            {loading ? (
              <div className="cv-fb__empty">Loading…</div>
            ) : noPreview || !page ? (
              <div className="cv-fb__empty">
                There's nothing to review on this project yet. Cre8 Visions will
                email you the moment there is.
              </div>
            ) : (
              <>
                <iframe
                  key={page.key}
                  src={pageUrl ?? undefined}
                  title={pageLabel(page)}
                  sandbox="allow-scripts allow-same-origin allow-popups"
                  referrerPolicy="no-referrer"
                  style={{ pointerEvents: tool === "comment" ? "none" : "auto" }}
                />
                {tool === "comment" && (
                  <button type="button" className="cv-fb__catch" aria-label="Add a comment at this spot"
                    onClick={(e) => {
                      const rect = stageRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      setDraft({ ...clickToPct(e.clientX, e.clientY, rect), body: "" });
                      setSelectedComment(null);
                    }} />
                )}

                {showPins && visiblePins.map((c) => {
                  const st = normaliseStatus(c.status);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`cv-pin ${st === "resolved" ? "cv-pin--done" : ""} ${selectedComment === c.id ? "cv-pin--sel" : ""}`}
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
                        placeholder="What should change here?"
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 16px" }} disabled={saving} onClick={saveDraft}>
                          {saving ? "Saving…" : "Add comment"}
                        </button>
                        <button type="button" className="cv-open" style={{ padding: "0 16px" }} onClick={() => setDraft(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            <div className="cv-fb__tools">
              <button type="button" className={`cv-tool cv-tool--wide ${tool === "comment" ? "cv-tool--on" : ""}`}
                onClick={() => setTool("comment")} title="Click the page to leave a comment">
                <MessageSquare size={16} /> COMMENT
              </button>
              <button type="button" className={`cv-tool ${tool === "browse" ? "cv-tool--on" : ""}`}
                onClick={() => { setTool("browse"); setDraft(null); }}
                aria-pressed={tool === "browse"}
                aria-label="Browse the page without commenting"
                title="Browse — click through the page without leaving comments">
                <MousePointer2 size={18} />
              </button>
              <button type="button" className={`cv-tool ${showResolved ? "cv-tool--on" : ""}`}
                onClick={() => setShowResolved((v) => !v)}
                aria-pressed={showResolved}
                aria-label={showResolved ? "Hide resolved comments" : "Show resolved comments"}
                title={showResolved ? "Hide resolved comments" : "Show resolved comments"}>
                <CheckCircle2 size={18} />
              </button>
              <button type="button" className={`cv-tool ${showPins ? "" : "cv-tool--on"}`}
                onClick={() => setShowPins((v) => !v)}
                aria-pressed={!showPins}
                aria-label={showPins ? "Hide pins" : "Show pins"}
                title={showPins ? "Hide pins" : "Show pins"}>
                {showPins ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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

                {!folders.length ? (
                  <EmptyState title="Nothing to review yet"
                    subtitle="Pages appear here as soon as Cre8 Visions shares them." />
                ) : folders.map((folder) => (
                  <div key={folder.name} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="cv-fb__grouphead">
                      <Folder size={16} aria-hidden="true" />
                      <span style={{ flex: 1 }}>{folder.name}</span>
                      <span>{folder.pages.length} page{folder.pages.length === 1 ? "" : "s"}</span>
                    </div>
                    {folder.pages.map((pg) => {
                      const all = commentsOn(pg);
                      const shown = filterComments(all, { query, showResolved });
                      const open = openCount(all);
                      return (
                        <div key={pg.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <button type="button" className={`cv-pgrow ${pg.key === selectedPage ? "cv-pgrow--on" : ""}`}
                            onClick={() => setSelectedPage(pg.key)}>
                            <span className="cv-pgrow__name">{pageLabel(pg)}<small>{pageKind(pg)}</small></span>
                            <span className={`cv-chip ${open ? "cv-s-open" : "cv-chip--gray"}`}>{open} open</span>
                          </button>
                          {shown.map((c) => {
                            const st = normaliseStatus(c.status);
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
                                  {/* Text, not a button. The status is what Cre8
                                      Visions is doing about the comment, which is
                                      not the client's to set. */}
                                  <span className={`cv-chip ${STATUS_CLASS[st]}`}>{STATUS_LABEL[st]}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
                <p style={{ margin: 0, fontSize: 12, color: "var(--cv-muted)" }}>
                  Cre8 Visions updates the status as each comment is worked on.
                </p>
              </>
            )}

            {tab === "pages" && (
              !folders.length ? (
                <EmptyState title="No pages yet"
                  subtitle="Pages appear here as soon as Cre8 Visions shares them." />
              ) : folders.map((folder) => (
                <div key={folder.name} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="cv-fb__grouphead">
                    <Folder size={16} aria-hidden="true" />
                    <span style={{ flex: 1 }}>{folder.name}</span>
                    <span>{folder.pages.length} page{folder.pages.length === 1 ? "" : "s"}</span>
                  </div>
                  {folder.pages.map((pg) => {
                    const open = openCount(commentsOn(pg));
                    const a = approvalFor(pg.key, approvals, lastEvent);
                    return (
                      <button key={pg.key} type="button"
                        className={`cv-pgrow ${pg.key === selectedPage ? "cv-pgrow--on" : ""}`}
                        onClick={() => { setSelectedPage(pg.key); setTab("comments"); }}>
                        <span className="cv-pgrow__name">{pageLabel(pg)}<small>{pageKind(pg)}</small></span>
                        {a.state !== "pending" && (
                          <span className={`cv-chip ${APPROVAL_CLASS[a.state]}`}>{APPROVAL_LABEL[a.state]}</span>
                        )}
                        <span className={`cv-chip ${open ? "cv-s-open" : "cv-chip--gray"}`}>{open} open</span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}

            {tab === "activity" && (
              !activity.length ? (
                <EmptyState title="Nothing has happened yet"
                  subtitle="Your comments and approvals read here, newest first." />
              ) : activity.map((a) => (
                <div key={a.id} className="cv-cm">
                  <span className="cv-cm__av">{authorInitials(a.who)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 500, fontSize: 14 }}>{a.who}</span>
                      <span style={{ fontSize: 14, color: "var(--cv-muted)" }}>{a.what}</span>
                      <span style={{ fontSize: 12, color: "var(--cv-muted)" }}>{timeAgo(a.at)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--cv-muted)", marginTop: 2 }}>{a.page}</div>
                    {a.detail && <div className="cv-cm__body">{a.detail}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
