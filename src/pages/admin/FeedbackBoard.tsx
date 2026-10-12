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
import {
  MessageSquare, MousePointer2, CheckCircle2, EyeOff, Eye, X, Upload, Check, Undo2, Folder,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import EmptyState from "@/components/admin/cv/EmptyState";
import FeedbackFilters from "@/components/feedback/FeedbackFilters";
import {
  filterComments, statusArgs, openCount, authorInitials, clickToPct, pageLabel, pageKind, groupOf,
  type StatusFilter,
  foldersOf, groupNames, sortPages, visibleTo, pageKey, normaliseStatus, NEXT_STATUS,
  STATUS_LABEL, STATUS_CLASS, approvalFor, buildActivity, APPROVAL_LABEL, APPROVAL_CLASS,
  type BoardPage, type BoardComment, type ApprovalRow, type ApprovalEvent,
} from "@/lib/feedbackBoard";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

/** preview-admin owns the storage bucket, so uploads go through it. */
async function callPreviewAdmin(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const r = await fetch(`${SUPABASE_URL}/functions/v1/preview-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const out = await r.json();
  if (!r.ok) throw new Error(out.error || "Request failed");
  return out as Record<string, unknown>;
}

/** Base64 without the data: prefix, which file_upload_single expects. */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
    fr.onerror = () => reject(new Error(`Could not read ${file.name}`));
    fr.readAsDataURL(file);
  });
}

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
  /** A page key, or "all" — what the comment list is scoped to. */
  const [pageFilter, setPageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  /** Where a click landed, while the composer for it is open. */
  const [draft, setDraft] = useState<{ x_pct: number; y_pct: number; body: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const [approvals, setApprovals] = useState<Map<string, ApprovalRow>>(new Map());
  const [lastEvent, setLastEvent] = useState<Map<string, ApprovalEvent>>(new Map());
  const [events, setEvents] = useState<ApprovalEvent[]>([]);
  /** The folder newly uploaded pages land in. */
  const [uploadGroup, setUploadGroup] = useState("");
  /** Which page's "ask for changes" box is open. */
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

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
    if (!ids.length) {
      setPages([]); setComments([]); setApprovals(new Map()); setEvents([]); setLastEvent(new Map());
      setLoading(false); return;
    }

    const [files, external, cmts, appr, evs] = await Promise.all([
      supabase.from("preview_files")
        .select("project_id, path, label, group_label, order_index, visible_to_client, content_type")
        .in("project_id", ids),
      supabase.from("preview_external_pages")
        .select("project_id, path, label, group_label, order_index, visible_to_client")
        .in("project_id", ids),
      supabase.from("preview_comments")
        .select("id, project_id, page_path, pin_number, x_pct, y_pct, author_name, body, status, created_at")
        .in("project_id", ids).order("pin_number", { ascending: true }),
      supabase.from("preview_approvals")
        .select("project_id, path, approved_at").in("project_id", ids),
      supabase.from("preview_approval_events")
        .select("id, project_id, path, action, note, approver_name, created_at")
        .in("project_id", ids).order("created_at", { ascending: false }),
    ]);
    for (const r of [files, external, cmts, appr, evs]) if (r.error) toast.error(r.error.message);

    setApprovals(new Map(((appr.data ?? []) as ApprovalRow[])
      .map((a) => [pageKey(a.project_id, a.path), a])));
    const evRows = (evs.data ?? []) as ApprovalEvent[];
    setEvents(evRows);
    // Newest first already, so the first one seen per page is the latest.
    const latest = new Map<string, ApprovalEvent>();
    for (const e of evRows) {
      const k = pageKey(e.project_id, e.path);
      if (!latest.has(k)) latest.set(k, e);
    }
    setLastEvent(latest);

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
  const folders = useMemo(() => foldersOf(shownPages), [shownPages]);
  const groups = useMemo(() => groupNames(pages), [pages]);
  const commentsOn = useCallback(
    (pg: BoardPage) => comments.filter((c) => pageKey(c.project_id, c.page_path) === pg.key),
    [comments],
  );

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

  const approve = async (pg: BoardPage) => {
    setBusy(pg.key);
    try {
      const who = user?.email ?? "Cre8 Visions";
      // The row is the fact and the event is the history, so both. Upsert
      // because approving an already-approved page should be a no-op, not
      // a duplicate-key error.
      const { error } = await supabase.from("preview_approvals").upsert({
        project_id: pg.previewId, path: pg.path, kind: pg.external ? "external" : "file",
        approver_name: who, approved_at: new Date().toISOString(),
      }, { onConflict: "project_id,path" });
      if (error) throw error;
      await supabase.from("preview_approval_events").insert({
        project_id: pg.previewId, path: pg.path, kind: pg.external ? "external" : "file",
        action: "approve", approver_name: who,
      });
      await load();
      toast.success(`${pageLabel(pg)} approved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not approve that page");
    } finally { setBusy(null); }
  };

  const requestChanges = async (pg: BoardPage) => {
    const note = reason.trim();
    if (!note) { toast.error("Say what needs changing"); return; }
    setBusy(pg.key);
    try {
      const who = user?.email ?? "Cre8 Visions";
      // Clearing the approval is what changes the state; the event is
      // what carries the reason. "Not approved" with no reason is the
      // least useful thing anyone can say about a page.
      await supabase.from("preview_approvals")
        .delete().eq("project_id", pg.previewId).eq("path", pg.path);
      const { error } = await supabase.from("preview_approval_events").insert({
        project_id: pg.previewId, path: pg.path, kind: pg.external ? "external" : "file",
        action: "changes_requested", approver_name: who, note,
      });
      if (error) throw error;
      setRejecting(null); setReason("");
      await load();
      toast.success("Sent back with your note");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record that");
    } finally { setBusy(null); }
  };

  const undoApproval = async (pg: BoardPage) => {
    setBusy(pg.key);
    try {
      await supabase.from("preview_approvals")
        .delete().eq("project_id", pg.previewId).eq("path", pg.path);
      await supabase.from("preview_approval_events").insert({
        project_id: pg.previewId, path: pg.path, kind: pg.external ? "external" : "file",
        action: "unapprove", approver_name: user?.email ?? "Cre8 Visions",
      });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not undo that");
    } finally { setBusy(null); }
  };

  const uploadPages = async (files: FileList | null) => {
    if (!files?.length) return;
    const target = preview ?? previews[0];
    if (!target) { toast.error("Add a preview to this project first"); return; }
    setBusy("upload");
    let done = 0;
    for (const file of Array.from(files)) {
      try {
        await callPreviewAdmin({
          action: "file_upload_single",
          project_id: target.id,
          path: file.name,
          content_base64: await toBase64(file),
          mime: file.type || "text/html",
        });
        // The upload endpoint takes no group, so the folder chosen above
        // is applied straight after. Separate call, same user action.
        if (uploadGroup) {
          await callPreviewAdmin({
            action: "file_meta", project_id: target.id, path: file.name, group_label: uploadGroup,
          });
        }
        done++;
      } catch (e) {
        toast.error(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
      }
    }
    setBusy(null);
    if (uploadRef.current) uploadRef.current.value = "";
    if (done) { await load(); toast.success(`Uploaded ${done} file${done === 1 ? "" : "s"}`); }
  };

  const setGroup = async (pg: BoardPage, group: string) => {
    try {
      if (pg.external) {
        // External pages are set as a whole list, so send every row back
        // with this one changed — see ProjectPreviewPanel's note.
        const rows = pages.filter((x) => x.previewId === pg.previewId && x.external)
          .map((x) => ({
            path: x.path, label: x.label,
            group_label: x.key === pg.key ? (group || null) : x.group,
            visible_to_client: x.visibleToClient,
          }));
        await callPreviewAdmin({ action: "external_pages_set", project_id: pg.previewId, pages: rows });
      } else {
        await callPreviewAdmin({
          action: "file_meta", project_id: pg.previewId, path: pg.path, group_label: group || null,
        });
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move that page");
    }
  };

  const toggleVisible = async (pg: BoardPage) => {
    try {
      if (pg.external) {
        const rows = pages.filter((x) => x.previewId === pg.previewId && x.external)
          .map((x) => ({
            path: x.path, label: x.label, group_label: x.group,
            visible_to_client: x.key === pg.key ? !x.visibleToClient : x.visibleToClient,
          }));
        await callPreviewAdmin({ action: "external_pages_set", project_id: pg.previewId, pages: rows });
      } else {
        await callPreviewAdmin({
          action: "file_meta", project_id: pg.previewId, path: pg.path,
          visible_to_client: !pg.visibleToClient,
        });
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not change that");
    }
  };

  const titleFor = useCallback((previewId: string, path: string) => {
    const pg = pages.find((x) => x.key === pageKey(previewId, path));
    return pg ? pageLabel(pg) : path;
  }, [pages]);

  const activity = useMemo(() => buildActivity(events, comments, titleFor), [events, comments, titleFor]);

  /**
   * Picking a page, from the dropdown or from a page row.
   *
   * One function because they are the same choice: scoping the comment
   * list to a page and putting that page on the stage. Two controls that
   * could disagree about which page you are on is worse than either.
   */
  const pickPage = (key: string) => {
    setPageFilter(key);
    if (key !== "all") setSelectedPage(key);
    setSelectedComment(null);
  };

  /** One comment, wherever the list is showing it from. */
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" className={`cv-chip ${STATUS_CLASS[st]}`}
              style={{ minHeight: 32, cursor: "pointer", border: 0 }}
              onClick={() => cycleStatus(c)}
              title="Click to change: Open → In progress → Resolved">
              {STATUS_LABEL[st]}
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
            <span style={{ fontWeight: 600 }}>{page ? pageLabel(page) : "No page"}</span>
            {page && <span className="cv-chip cv-chip--gray">{groupOf(page)}</span>}
            <span style={{ fontSize: 13, color: "var(--cv-muted)", flex: 1 }}>
              {tool === "comment"
                ? "Click anywhere on the page to leave a comment"
                : "Browsing — switch to Comment to leave one"}
            </span>
            {page && (() => {
              const a = approvalFor(page.key, approvals, lastEvent);
              return (
                <>
                  <span className={`cv-chip ${APPROVAL_CLASS[a.state]}`} title={a.note ?? undefined}>
                    {APPROVAL_LABEL[a.state]}
                  </span>
                  {a.state === "approved" ? (
                    <button type="button" className="cv-mini" disabled={busy === page.key}
                      onClick={() => undoApproval(page)}>
                      <Undo2 size={14} style={{ marginRight: 6 }} /> Undo approval
                    </button>
                  ) : (
                    <>
                      <button type="button" className="cv-open cv-open--go" style={{ padding: "0 16px", minHeight: 40 }}
                        disabled={busy === page.key} onClick={() => approve(page)}>
                        <Check size={15} style={{ marginRight: 6 }} /> Approve
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
                  placeholder="The hero image is the old logo, and the phone number is out of date." />
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 16px" }}
                  disabled={busy === page.key} onClick={() => requestChanges(page)}>
                  {busy === page.key ? "Sending…" : "Send back"}
                </button>
                <button type="button" className="cv-open" style={{ padding: "0 16px" }}
                  onClick={() => { setRejecting(null); setReason(""); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {page && (() => {
            const a = approvalFor(page.key, approvals, lastEvent);
            return a.state === "changes_requested" && a.note ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--cv-tone-amber-fg)" }}>
                Sent back{a.who ? ` by ${a.who}` : ""}: {a.note}
              </p>
            ) : null;
          })()}

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
                  title={pageLabel(page)}
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

              </>
            )}

            {/* Outside the page branch on purpose. It used to live inside
                it, so a project with no preview pages yet had no toolbar
                at all — which is exactly when someone clicks one of these
                to find out why nothing is happening. */}
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
                onClick={() => { setShowResolved((v) => !v); toast(showResolved ? "Hiding resolved" : "Showing resolved"); }}
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
                <FeedbackFilters
                  pages={shownPages}
                  pageFilter={pageFilter}
                  onPageFilter={pickPage}
                  status={statusFilter}
                  onStatus={setStatusFilter}
                  query={query}
                  onQuery={setQuery}
                  openCount={openCount(comments)}
                />

                {!folders.length ? (
                  <EmptyState title="No pages yet" subtitle="Add a preview to this project and its pages appear here." />
                ) : pageFilter !== "all" ? (
                  // One page chosen: its comments, flat. No folder heading
                  // and no page row, because the dropdown above already
                  // says which page this is.
                  (() => {
                    const pg = shownPages.find((x) => x.key === pageFilter);
                    if (!pg) return <EmptyState title="That page is gone" subtitle="Pick another from the list above." />;
                    const shown = filterComments(commentsOn(pg), { query, ...statusArgs(statusFilter) });
                    if (!shown.length) {
                      return (
                        <EmptyState
                          title={`Nothing on ${pageLabel(pg)}`}
                          subtitle={statusFilter === "all" && !query
                            ? "No comments on this page yet. Click the page to leave one."
                            : "No comments match this filter."}
                        />
                      );
                    }
                    return shown.map((c) => commentCard(c, pg));
                  })()
                ) : (() => {
                  // Comments only. A page with nothing on it is not a
                  // comment, and listing all forty of them with "0 open"
                  // beside each turns the Comments tab into the Pages
                  // tab with feedback hidden somewhere inside it.
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
                        title="No comments"
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
                  Click a status to change it: Open, In progress, Resolved.
                </p>
              </>
            )}

            {tab === "pages" && (
              <>
                {!asClient && (
                  <div className="cv-fb__drop">
                    <div style={{ fontWeight: 500, fontSize: 14 }}>Add pages for review</div>
                    <div style={{ fontSize: 13, color: "var(--cv-muted)" }}>
                      Upload images (PNG, JPG) or HTML files. Each file becomes a page
                      the client can comment on.
                    </div>
                    <label className="cv-field" style={{ alignSelf: "stretch" }}>
                      Add to group
                      {/* The folder is chosen ONCE, here, for everything in
                          this upload — rather than typed again on every row
                          afterwards, which is what made the rail unreadable. */}
                      <select className="cv-select" value={uploadGroup}
                        onChange={(e) => {
                          if (e.target.value !== "__new") { setUploadGroup(e.target.value); return; }
                          const name = window.prompt("Name the new group")?.trim();
                          if (name) setUploadGroup(name);
                        }}>
                        <option value="">No group</option>
                        {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                        {uploadGroup && !groups.includes(uploadGroup) && (
                          <option value={uploadGroup}>{uploadGroup}</option>
                        )}
                        <option value="__new">+ New group…</option>
                      </select>
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 16px" }}
                        disabled={busy === "upload"} onClick={() => uploadRef.current?.click()}>
                        <Upload size={15} style={{ marginRight: 7 }} />
                        {busy === "upload" ? "Uploading…" : "Upload files"}
                      </button>
                      <input ref={uploadRef} type="file" multiple hidden
                        accept=".html,.htm,text/html,image/png,image/jpeg,image/webp"
                        onChange={(e) => uploadPages(e.target.files)} />
                    </div>
                  </div>
                )}

                {!shownPages.length ? (
                  <EmptyState title="No pages" subtitle={asClient
                    ? "Nothing is shared with the client yet."
                    : "Upload one above and it appears here."} />
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
                      const selected = pg.key === selectedPage;
                      return (
                        <div key={pg.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {/* Same choice as the dropdown: scope the comment
                              list to this page and put it on the stage. */}
                          <button type="button" className={`cv-pgrow ${selected ? "cv-pgrow--on" : ""}`}
                            onClick={() => { pickPage(pg.key); setTab("comments"); }}>
                            <span className="cv-pgrow__name">
                              {pageLabel(pg)}
                              <small>{pageKind(pg)}</small>
                            </span>
                            {a.state !== "pending" && (
                              <span className={`cv-chip ${APPROVAL_CLASS[a.state]}`}>{APPROVAL_LABEL[a.state]}</span>
                            )}
                            <span className={`cv-chip ${open ? "cv-s-open" : "cv-chip--gray"}`}>{open} open</span>
                          </button>

                          {/* Only for the page that is open. A select and an
                              eye on all twenty rows is the mess; on one row
                              it is the controls for the page you are on. */}
                          {!asClient && selected && (
                            <div className="cv-pgrow__edit">
                              <select className="cv-select" style={{ flex: "1 1 150px", minHeight: 38, fontSize: 13 }}
                                value={pg.group ?? ""}
                                onChange={(e) => {
                                  if (e.target.value !== "__new") { setGroup(pg, e.target.value); return; }
                                  const name = window.prompt("Move to which group?", pg.group ?? "")?.trim();
                                  if (name) setGroup(pg, name);
                                }}>
                                <option value="">No group</option>
                                {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                                <option value="__new">+ New group…</option>
                              </select>
                              <button type="button" className="cv-mini" onClick={() => toggleVisible(pg)}
                                title={pg.visibleToClient ? "Visible to the client" : "Hidden from the client"}>
                                {pg.visibleToClient ? <Eye size={14} /> : <EyeOff size={14} />}
                                <span style={{ marginLeft: 6 }}>{pg.visibleToClient ? "Shown" : "Hidden"}</span>
                              </button>
                            </div>
                          )}

                          {a.state === "changes_requested" && a.note && (
                            <div style={{ fontSize: 12, color: "var(--cv-tone-amber-fg)", padding: "0 4px" }}>{a.note}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}

                {!asClient && (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--cv-muted)" }}>
                    Groups are optional. Open a page to move it to another group
                    or hide it. The client sees the same groups and pages,
                    without the upload box.
                  </p>
                )}
              </>
            )}

            {tab === "activity" && (
              !activity.length ? (
                <EmptyState title="Nothing has happened yet"
                  subtitle="Comments, approvals and pages sent back read here, newest first." />
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
                  <span className={`cv-chip cv-chip--${a.tone}`} style={{ alignSelf: "flex-start" }} aria-hidden="true" />
                </div>
              ))
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
