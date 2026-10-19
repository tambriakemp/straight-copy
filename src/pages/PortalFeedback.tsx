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
import { MessageSquare, MousePointer2, CheckCircle2, EyeOff, Eye, X, Check, Folder, Undo2 } from "lucide-react";
import EmptyState from "@/components/admin/cv/EmptyState";
import FeedbackFilters from "@/components/feedback/FeedbackFilters";
import {
  filterComments, statusArgs, openCount, authorInitials, clickToPct, pageLabel, pageKind,
  foldersOf, sortPages, pageKey, normaliseStatus, STATUS_LABEL, STATUS_CLASS,
  approvalFor, pageVerdict, buildActivity, APPROVAL_LABEL, APPROVAL_CLASS,
  type BoardPage, type BoardComment, type ApprovalRow, type ApprovalEvent, type StatusFilter,
} from "@/lib/feedbackBoard";
import { portalFetch, portalFetchGet } from "@/lib/portalFetch";
import { useAdminPreview } from "@/hooks/useAdminPreview";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type Tool = "comment" | "browse";
type Tab = "comments" | "pages" | "activity";

interface ProjectRow { id: string; type: string; name: string }

async function callFn(fn: string, body: Record<string, unknown>, adminPreview: boolean) {
  const r = await portalFetch(fn, body, adminPreview);
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

/**
 * Every comment on every page, one request per page.
 *
 * The fallback for a deployment that does not yet have the bulk
 * `comments` action. preview-comments GET has been public since the
 * preview feature shipped and answers for one page at a time.
 */
async function commentsPerPage(
  slug: string, previewId: string, pages: BoardPage[], adminPreview: boolean,
): Promise<BoardComment[]> {
  const out: BoardComment[] = [];
  // In small batches: a project with forty pages should not open forty
  // sockets at once and have the browser queue them anyway.
  for (let i = 0; i < pages.length; i += 6) {
    const batch = pages.slice(i, i + 6);
    const got = await Promise.all(batch.map(async (pg) => {
      try {
        const r = await portalFetchGet(
          `${SUPABASE_URL}/functions/v1/preview-comments?slug=${encodeURIComponent(slug)}`
          + `&page_path=${encodeURIComponent(pg.path)}`,
          adminPreview,
        );
        if (!r.ok) return [];
        const data = await r.json() as { comments?: Array<Record<string, unknown>> };
        return (data.comments ?? []).map((c) => ({
          ...c, project_id: previewId, page_path: pg.path,
        }) as unknown as BoardComment);
      } catch {
        return [];
      }
    }));
    for (const g of got) out.push(...g);
  }
  return out;
}

export default function PortalFeedback() {
  const { clientId, projectId } = useParams<{ clientId: string; projectId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const adminPreview = useAdminPreview();

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
  /** A page key, or "all" — what the comment list is scoped to. */
  const [pageFilter, setPageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
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
        const data = await callFn("brand-kit-intake", { clientId, action: "resolve" }, adminPreview);
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
  }, [clientId, adminPreview]);

  // ---- the board for the chosen project --------------------------------
  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    setNoPreview(false);
    try {
      const listed = await callFn("preview-approvals", { action: "list", client_project_id: current }, adminPreview);
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
        callFn("preview-approvals", { action: "comments", slug: proj.slug }, adminPreview).catch(() => null),
        callFn("preview-approvals", { action: "events", slug: proj.slug }, adminPreview).catch(() => null),
      ]);

      // The bulk `comments` action is new and may not be deployed yet.
      // Rather than show an empty rail and let the client conclude their
      // feedback vanished, fall back to the per-page endpoint that has
      // always been there — one request per page, which is the cost of
      // not being deployed, not a reason to show nothing.
      let rows = (cRes?.comments ?? null) as BoardComment[] | null;
      if (!rows) rows = await commentsPerPage(proj.slug, proj.id, built, adminPreview);
      setComments(rows);

      const evRows = ((eRes?.events ?? []) as Array<Partial<ApprovalEvent>>)
        // The deployed `events` action predates the id and note columns,
        // so both can be missing. An id is only a React key here; a
        // synthesised one is better than a list of undefined keys.
        .map((e, i) => ({
          id: e.id ?? `${e.path ?? "?"}:${e.created_at ?? i}`,
          project_id: proj.id,
          path: e.path ?? "",
          action: e.action ?? "",
          note: e.note ?? null,
          approver_name: e.approver_name ?? null,
          created_at: e.created_at ?? new Date(0).toISOString(),
        }) as ApprovalEvent);
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
  }, [current, adminPreview]);

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
      await portalFetch(
        "preview-comments",
        {
          slug, page_path: page.path,
          // The public endpoint requires a selector — it was written for
          // the in-page widget, which had an element to name. A pin
          // dropped on a frame has none, so the position is the record.
          selector: "body",
          x_pct: draft.x_pct, y_pct: draft.y_pct,
          author_name: clientName || "Guest",
          body,
        },
        adminPreview,
      ).then(async (r) => {
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
      }, adminPreview);
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
      }, adminPreview);
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
      }, adminPreview);
      setRejecting(null); setReason("");
      await load();
      toast.success("Sent back with your note");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record that");
    } finally { setBusy(null); }
  };

  /** The dropdown and a page row are the same choice: scope the list and
   *  move the stage. */
  const pickPage = (key: string) => {
    setPageFilter(key);
    if (key !== "all") setSelectedPage(key);
    setSelectedComment(null);
  };

  /** One comment. The status is text, not a button — what Cre8 Visions
   *  is doing about a comment is not the client's to set. */
  const commentCard = (c: BoardComment, pg: BoardPage) => {
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
          <span className={`cv-chip ${STATUS_CLASS[st]}`}>{STATUS_LABEL[st]}</span>
        </div>
      </div>
    );
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
              const raw = approvalFor(page.key, approvals, lastEvent);
              // Open comments outrank a standing approval — see pageVerdict.
              const a = { ...raw, state: pageVerdict(raw.state, openCount(commentsOn(page))) };
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
            {/* The project picker, above the search — not in the top bar.
                Which project you are reading is the same kind of choice
                as which page and which status, and the three belong
                together. In the bar it sat beside Close and read as
                chrome. */}
            {projects.length > 1 && (
              <label className="cv-field">
                Project
                <select className="cv-select" value={current ?? ""}
                  onChange={(e) => {
                    setCurrent(e.target.value);
                    setSelectedPage(null); setPageFilter("all"); setDraft(null);
                  }}>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            )}

            {tab === "comments" && (
              <>
                <FeedbackFilters
                  pages={pages}
                  pageFilter={pageFilter}
                  onPageFilter={pickPage}
                  status={statusFilter}
                  onStatus={setStatusFilter}
                  query={query}
                  onQuery={setQuery}
                  openCount={openCount(comments)}
                />

                {!folders.length ? (
                  <EmptyState title="Nothing to review yet"
                    subtitle="Pages appear here as soon as Cre8 Visions shares them." />
                ) : pageFilter !== "all" ? (
                  (() => {
                    const pg = pages.find((x) => x.key === pageFilter);
                    if (!pg) return <EmptyState title="That page is gone" subtitle="Pick another from the list above." />;
                    const shown = filterComments(commentsOn(pg), { query, ...statusArgs(statusFilter) });
                    if (!shown.length) {
                      return (
                        <EmptyState
                          title={`Nothing on ${pageLabel(pg)}`}
                          subtitle={statusFilter === "all" && !query
                            ? "Click anywhere on the page to leave the first comment."
                            : "No comments match this filter."}
                        />
                      );
                    }
                    return shown.map((c) => commentCard(c, pg));
                  })()
                ) : (() => {
                  // Comments only. The Pages tab is where pages live; a
                  // list of every page with "0 open" beside it is not a
                  // list of feedback.
                  const withComments = folders
                    .map((folder) => ({
                      name: folder.name,
                      pages: folder.pages
                        .map((pg) => ({ pg, shown: filterComments(commentsOn(pg), { query, ...statusArgs(statusFilter) }) }))
                        .filter((x) => x.shown.length > 0),
                    }))
                    .filter((f) => f.pages.length > 0);

                  if (!withComments.length) {
                    return (
                      <EmptyState
                        title="No comments yet"
                        subtitle={query || statusFilter !== "all"
                          ? "Nothing matches this filter."
                          : "Click anywhere on a page to leave the first one."}
                      />
                    );
                  }

                  return withComments.map((folder) => (
                    <div key={folder.name} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div className="cv-fb__grouphead">
                        <Folder size={16} aria-hidden="true" />
                        <span style={{ flex: 1 }}>{folder.name}</span>
                      </div>
                      {folder.pages.map(({ pg, shown }) => (
                        <div key={pg.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <button type="button" className="cv-fb__pagehead" onClick={() => pickPage(pg.key)}>
                            {pageLabel(pg)}
                            <span>{shown.length}</span>
                          </button>
                          {shown.map((c) => commentCard(c, pg))}
                        </div>
                      ))}
                    </div>
                  ));
                })()}
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
                    const raw = approvalFor(pg.key, approvals, lastEvent);
                    const a = { ...raw, state: pageVerdict(raw.state, open) };
                    return (
                      <button key={pg.key} type="button"
                        className={`cv-pgrow ${pg.key === selectedPage ? "cv-pgrow--on" : ""}`}
                        onClick={() => { pickPage(pg.key); setTab("comments"); }}>
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
