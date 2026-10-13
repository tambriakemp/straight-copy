import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check, Copy, Eye, EyeOff, ExternalLink, FileText, History, Paperclip, RefreshCw, Settings, X,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import EmptyState from "@/components/admin/cv/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import SidePanel from "@/components/admin/SidePanel";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  nextCutoffLabel, roundProgress, effectiveStatus, statusChip, rebuildBatchProgress,
  type EffectiveStatus,
} from "@/lib/prospectRound";
import { useAdminAuth } from "@/hooks/useAdminAuth";

const ATTACHMENT_BUCKET = "prospect-approval-attachments";
const ACCEPTED_ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

interface AttachmentDraft {
  file: File;
  previewUrl: string | null; // object URL for images; null for PDFs (icon instead)
}

function validateAttachment(file: File): string | null {
  if (!ACCEPTED_ATTACHMENT_TYPES.includes(file.type)) return `${file.name}: unsupported type`;
  if (file.size > MAX_ATTACHMENT_BYTES) return `${file.name}: over 10 MB`;
  return null;
}

function slugifyFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
  return `${slug}${ext}`;
}

// Keep in sync with prospectKeyAndVersion in
// supabase/functions/prospect-approvals-sync/index.ts — both sides must
// derive the same key for the same slug, or a round written here won't
// group with the history the edge function reads back for Nicole.
function prospectKeyAndVersion(slug: string): { prospectKey: string; version: string } {
  const m = slug.match(/^(.*)-v(\d+)$/i);
  if (m) return { prospectKey: m[1], version: `v${m[2]}` };
  return { prospectKey: slug, version: "v1" };
}

const CT_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short",
});
function formatCT(iso: string): string {
  return `${CT_FORMATTER.format(new Date(iso))} CT`;
}

// prospect_approvals and app_secrets aren't in the generated Database type
// yet — see the same note in Briefs.tsx.
const db = supabase as unknown as { from: (table: string) => any };

type Status = "pending" | "approved" | "rejected";

// Order matters here — it's the left-to-right order of the filter tabs.
// No "All" tab (CRE-444): Pending is the default view Bree lands on, and
// every other status is one click away, not folded into one giant list.
const STATUS_FILTERS: { key: EffectiveStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "rebuilt", label: "Rebuilt" },
  { key: "queued", label: "Queued" },
  { key: "rebuilding", label: "Rebuilding" },
  { key: "stuck", label: "Stuck" },
  { key: "approved", label: "Approved" },
  { key: "sent_back", label: "Sent back" },
  { key: "skipped", label: "Skipped" },
];

interface Prospect {
  id: string;
  batch: string;
  slug: string;
  company: string;
  city: string | null;
  trade: string | null;
  contact_name: string | null;
  contact_email: string | null;
  hook: string | null;
  current_site_url: string | null;
  preview_url: string | null;
  preview_image_url: string | null;
  email_subject: string | null;
  email_body: string | null;
  status: Status;
  notes: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
  updated_at: string;
  // CRE-413 rebuild-issue-per-rejection pipeline — see @/lib/prospectRound
  // for what each of these means together.
  rebuild_issue_id: string | null;
  rebuild_status: "queued" | "rebuilding" | "ready_for_review" | "stuck" | null;
  rebuild_stuck_reason: string | null;
  rebuild_round: number;
  rebuild_issue_closed_at: string | null;
}

interface FeedbackAttachment {
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  signed_url: string | null;
}

// One round of feedback (CRE-303 follow-up, Bree 11:01 AM CT Oct 6): a Submit
// in the composer, read-only once saved. Fetched by prospect_key, so a
// rebuild that lands as a new row (acme-roofing-v2) still shows the rounds
// left on acme-roofing (v1) — see prospectKeyAndVersion above.
interface FeedbackRound {
  id: string;
  round: number;
  preview_version: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  attachments: FeedbackAttachment[];
}

function openInNewTab(url: string | null | undefined) {
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

function randomSecret(len = 40) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, len);
}

// The prospect-approvals ingest key used to be minted from a Settings
// sheet on this page, by a local copy of SecretRow — one of three
// copies of the same component. It lives on Settings -> Keys now,
// which is where every other key already was, so both the sheet and
// the copy are gone rather than being a second place to rotate the
// same value from.


export default function Approvals() {
  const { user } = useAdminAuth();
  const isMobile = useIsMobile();
  const [prospects, setProspects] = useState<Prospect[] | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [attachmentDrafts, setAttachmentDrafts] = useState<Record<string, AttachmentDraft[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [panelHistory, setPanelHistory] = useState<FeedbackRound[] | null>(null);
  /** Which prospect the right-hand panel is showing. */
  const [currentId, setCurrentId] = useState<string | null>(null);
  /** "New design" or "Current site" in the compare toggle. */
  const [compare, setCompare] = useState<"new" | "current">("new");
  /**
   * Skipped this session only. Nothing is written: skipping is looking and
   * moving on, and it is still pending at the cutoff — recording it would
   * turn "I'll come back to this" into a decision.
   */
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  /** Which status chip the Queue list is scoped to — defaults to Pending. */
  const [statusFilter, setStatusFilter] = useState<EffectiveStatus>("pending");

  const load = async () => {
    // One running list (CRE-444): no batch split here — oldest ingested
    // first, so new prospects land at the bottom as they're added rather
    // than forcing a click through a dated tab to find them. `batch`
    // stays on the row and in the database for the rebuild pipeline and
    // SureContact tagging; it just no longer slices what's shown here.
    const { data, error } = await db.from("prospect_approvals").select("*")
      .order("created_at", { ascending: true });
    if (error) { toast.error(error.message); return; }
    setProspects((data ?? []) as Prospect[]);
  };
  useEffect(() => { load(); }, []);

  // Attachments are uploaded only at save time — a panel opened, attached-to,
  // then closed without submitting leaves no orphan files in the bucket.
  // Each attachment belongs to a feedback round, not to the prospect alone
  // (CRE-303 follow-up), so a round must already exist before this runs.
  const uploadAttachments = async (id: string, feedbackId: string): Promise<string | null> => {
    const drafts = attachmentDrafts[id] ?? [];
    if (!drafts.length) return null;
    const { data: userRes } = await supabase.auth.getUser();
    for (const draft of drafts) {
      const path = `${id}/${crypto.randomUUID()}-${slugifyFileName(draft.file.name)}`;
      const up = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, draft.file, {
        contentType: draft.file.type,
        upsert: false,
      });
      if (up.error) return `${draft.file.name}: ${up.error.message}`;
      const { error: insErr } = await db.from("prospect_approval_attachments").insert({
        prospect_id: id,
        feedback_id: feedbackId,
        storage_path: path,
        file_name: draft.file.name,
        mime_type: draft.file.type,
        size_bytes: draft.file.size,
        uploaded_by: userRes.user?.id ?? null,
      });
      if (insErr) return `${draft.file.name}: ${insErr.message}`;
    }
    return null;
  };

  const clearAttachmentDrafts = (id: string) => {
    setAttachmentDrafts((d) => {
      (d[id] ?? []).forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      const next = { ...d };
      delete next[id];
      return next;
    });
  };

  // Every round left on this prospect, across whichever batch/slug version it
  // was written from — keyed by prospect_key, not this row's own id.
  const loadHistory = async (prospect: Prospect) => {
    const { prospectKey } = prospectKeyAndVersion(prospect.slug);
    const { data: rounds, error } = await db.from("prospect_approval_feedback")
      .select("id, round, preview_version, notes, created_at, created_by")
      .eq("prospect_key", prospectKey)
      .order("round", { ascending: false });
    if (error) { toast.error(error.message); setPanelHistory([]); return; }
    const feedbackIds = (rounds ?? []).map((r: { id: string }) => r.id);
    const attachmentsByFeedback = new Map<string, FeedbackAttachment[]>();
    if (feedbackIds.length) {
      const { data: attachRows } = await db.from("prospect_approval_attachments")
        .select("feedback_id, storage_path, file_name, mime_type, size_bytes")
        .in("feedback_id", feedbackIds);
      const paths = (attachRows ?? []).map((a: { storage_path: string }) => a.storage_path);
      const signedByPath = new Map<string, string>();
      if (paths.length) {
        const { data: signed } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrls(paths, 600);
        (signed ?? []).forEach((s) => { if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl); });
      }
      for (const a of attachRows ?? []) {
        const list = attachmentsByFeedback.get(a.feedback_id) ?? [];
        list.push({
          file_name: a.file_name, mime_type: a.mime_type, size_bytes: a.size_bytes,
          signed_url: signedByPath.get(a.storage_path) ?? null,
        });
        attachmentsByFeedback.set(a.feedback_id, list);
      }
    }
    setPanelHistory((rounds ?? []).map((r: Omit<FeedbackRound, "attachments">) => ({
      ...r, attachments: attachmentsByFeedback.get(r.id) ?? [],
    })));
  };

  // Submit saves the composer as a new, read-only round — independent of
  // Approve/Reject, so Bree can leave several rounds of feedback across
  // rebuild cycles rather than one field that keeps getting overwritten.
  const submitRound = async (id: string): Promise<boolean> => {
    const prospect = prospects?.find((p) => p.id === id);
    if (!prospect) return false;
    const notes = (noteDrafts[id] ?? "").trim();
    const drafts = attachmentDrafts[id] ?? [];
    if (!notes && !drafts.length) {
      toast.error("Add notes or an attachment before submitting");
      return false;
    }
    setBusyId(id);
    const { prospectKey, version } = prospectKeyAndVersion(prospect.slug);
    const { data: maxRow } = await db.from("prospect_approval_feedback")
      .select("round").eq("prospect_key", prospectKey).order("round", { ascending: false }).limit(1).maybeSingle();
    const round = (maxRow?.round ?? 0) + 1;
    const { data: feedbackRow, error } = await db.from("prospect_approval_feedback").insert({
      approval_id: id,
      prospect_key: prospectKey,
      round,
      preview_version: version,
      notes: notes || null,
      created_by: user?.email ?? null,
    }).select("id").single();
    if (error) { setBusyId(null); toast.error(error.message); return false; }
    const attachErr = await uploadAttachments(id, feedbackRow.id as string);
    setBusyId(null);
    if (attachErr) { toast.error(`Round ${round} saved, but an attachment failed: ${attachErr}`); } else {
      toast.success(`Round ${round} saved`);
    }
    setNoteDrafts((d) => ({ ...d, [id]: "" }));
    clearAttachmentDrafts(id);
    await loadHistory(prospect);
    return true;
  };

  const decide = async (id: string, next: Status) => {
    const hasDraft = !!(noteDrafts[id] ?? "").trim() || !!(attachmentDrafts[id] ?? []).length;
    if (hasDraft) {
      const ok = await submitRound(id);
      if (!ok) return; // submitRound already surfaced the error
    }
    setBusyId(id);
    const { error } = await db.from("prospect_approvals").update({
      status: next,
      decided_at: new Date().toISOString(),
      decided_by: user?.email ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(next === "approved" ? "Approved" : "Rejected");
    setPanelId((p) => (p === id ? null : p));
    load();
  };

  const addAttachmentFiles = (id: string, files: FileList | File[] | null) => {
    if (!files) return;
    const next: AttachmentDraft[] = [];
    for (const file of Array.from(files)) {
      const problem = validateAttachment(file);
      if (problem) { toast.error(problem); continue; }
      next.push({ file, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null });
    }
    if (next.length) setAttachmentDrafts((d) => ({ ...d, [id]: [...(d[id] ?? []), ...next] }));
  };

  const removeAttachmentDraft = (id: string, idx: number) => {
    setAttachmentDrafts((d) => {
      const list = [...(d[id] ?? [])];
      const [removed] = list.splice(idx, 1);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return { ...d, [id]: list };
    });
  };

  const panelProspect = (prospects ?? []).find((p) => p.id === panelId) ?? null;
  const panelAttachments = panelId ? attachmentDrafts[panelId] ?? [] : [];

  useEffect(() => {
    if (!panelId) { setPanelHistory(null); return; }
    const prospect = (prospects ?? []).find((p) => p.id === panelId);
    if (prospect) loadHistory(prospect);
    // prospects is intentionally omitted: a decide()/load() refresh while the
    // panel is open must not re-trigger this — submitRound already reloads
    // history itself after a successful save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelId]);

  // The queue is every prospect ever ingested, in the order it was ingested,
  // pending first: you work down it, and a decided one dropping out from
  // under the cursor would lose your place. They stay, greyed by their pill.
  const queue = useMemo(() => prospects ?? [], [prospects]);
  const roundStatuses = queue.map((p) => p.status);
  const progress = roundProgress(roundStatuses, skipped.size);
  const cutoff = nextCutoffLabel();
  // "Rebuilds: N of M done" — only every row that's had a rebuild issue
  // created counts toward M, so a batch with no rejections yet shows
  // nothing rather than "0 of 0 done".
  const rebuildProgress = useMemo(() => rebuildBatchProgress(queue), [queue]);

  const current = queue.find((p) => p.id === currentId) ?? queue[0] ?? null;

  // Status-chip filter tags scope the Queue list only — advance/current
  // still walk the full, unfiltered queue so Approve/Skip/Send back keep
  // landing on the next real pending row even while a filter is applied.
  const statusCounts = useMemo(() => {
    const counts = {} as Record<EffectiveStatus, number>;
    for (const p of queue) {
      const s = effectiveStatus(p, skipped.has(p.id));
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [queue, skipped]);
  const visibleQueue = useMemo(
    () => queue.filter((p) => effectiveStatus(p, skipped.has(p.id)) === statusFilter),
    [queue, statusFilter, skipped],
  );

  const advance = (fromId: string) => {
    const i = queue.findIndex((p) => p.id === fromId);
    const next = queue.slice(i + 1).find((p) => p.status === "pending" && !skipped.has(p.id));
    setCurrentId(next?.id ?? null);
  };

  const skip = (id: string) => {
    // No write. Skipping is looking and moving on; it is still pending at
    // the cutoff, and saying otherwise in the database would turn "I'll
    // come back to this" into a decision.
    setSkipped((s) => new Set(s).add(id));
    advance(id);
  };

  const approve = async (id: string) => {
    await decide(id, "approved");
    advance(id);
  };

  const previewSrc = current
    ? (compare === "current" ? current.current_site_url : current.preview_url)
    : null;
  const posterSrc = current && compare === "new" ? current.preview_image_url : null;

  return (
    <AdminLayout topBar={false}>
      <div className="cv-admin cv-page" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>

        <div>
          <h1 className="cv-page-title">Prospects</h1>
          <p className="cv-page-sub">
            Review each redesigned homepage before it goes out. Approved ones
            are emailed at the cutoff.
          </p>
        </div>

        <section
          className="cv-card cv-card-pad"
          style={{ background: "var(--cv-ink)", color: "#fff", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18 }}
        >
          <div style={{ flex: "1 1 280px", minWidth: 0 }}>
            <div style={{ fontSize: 14, color: "#C9CFDB" }}>Cutoff</div>
            <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.2 }}>{cutoff}</div>
            <div style={{ fontSize: 13, color: "#C9CFDB" }}>
              Anything still pending then rolls over to next month's batch for
              priority review. Only approved previews go out.
            </div>
          </div>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#C9CFDB", marginBottom: 6 }}>
              <span>{progress.approved} approved · {progress.sentBack} sent back · {progress.skipped} skipped</span>
              <span>{progress.pending} to go</span>
            </div>
            <span className="cv-bar cv-bar--invert" style={{ height: 10 }}>
              <i style={{ width: `${progress.pct}%` }} />
            </span>
            {rebuildProgress.total > 0 && (
              <div style={{ fontSize: 13, color: "#C9CFDB", marginTop: 8 }}>
                Rebuilds: {rebuildProgress.done} of {rebuildProgress.total} done
              </div>
            )}
          </div>
        </section>

        {!prospects ? (
          <p className="cv-page-sub">Loading…</p>
        ) : !queue.length ? (
          <EmptyState
            title="Nothing in this round"
            subtitle="Prospect previews land here when the outreach routine ingests a batch."
          />
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
            <section
              className="cv-card"
              style={isMobile
                // On a phone the queue and the detail card stack (flex-wrap
                // kicks in well before 280px+520px fits a line). A sticky,
                // near-full-viewport-tall queue above the detail card buried
                // the preview dozens of rows down — this is the fix for
                // CRE-441 ("mobile shows only the site names"). Capping the
                // height, dropping sticky, and moving the queue after the
                // detail card (via `order`) means the thing you actually
                // came to look at is the first thing on screen.
                ? { order: 2, flex: "1 1 auto", width: "100%", minWidth: 0, padding: 16, maxHeight: 260, overflow: "auto" }
                : { flex: "1 1 280px", minWidth: 0, padding: 16, maxHeight: "calc(100vh - 40px)", overflow: "auto", position: "sticky", top: 20 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px 12px" }}>
                <span style={{ fontWeight: 600 }}>Queue</span>
                <span className="cv-chip cv-chip--gray">{queue.length} total</span>
              </div>
              <div className="cv-filter-tabs" style={{ padding: "0 6px 12px" }}>
                {/* Pending always shows, even at zero, since it's the default
                    view (CRE-444) — every other tab only appears once there's
                    something in it, same as before. */}
                {STATUS_FILTERS.filter((f) => f.key === "pending" || statusCounts[f.key]).map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`cv-filter-tab ${statusFilter === f.key ? "cv-filter-tab--active" : ""}`}
                    onClick={() => setStatusFilter(f.key)}
                  >
                    {f.label} {statusCounts[f.key] ?? 0}
                  </button>
                ))}
              </div>
              {!visibleQueue.length ? (
                <p style={{ margin: 0, padding: "0 6px", fontSize: 13, color: "var(--cv-muted)" }}>
                  Nothing in this filter.
                </p>
              ) : visibleQueue.map((p) => {
                const effective = effectiveStatus(p, skipped.has(p.id));
                const chip = statusChip(effective);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`cv-q ${current?.id === p.id ? "cv-q--on" : ""}`}
                    onClick={() => setCurrentId(p.id)}
                  >
                    <span className="cv-q__who">
                      <b>{p.company}</b>
                      <small>{[p.trade, p.city].filter(Boolean).join(" · ") || "No sector on file"}</small>
                      <small>Added {formatCT(p.created_at)}</small>
                    </span>
                    <span style={{ display: "flex", gap: 6 }}>
                      {effective === "rebuilt" && (
                        <span className="cv-chip cv-chip--bronze">
                          Rebuilt{p.rebuild_round > 0 ? ` · Round ${p.rebuild_round}` : ""}
                        </span>
                      )}
                      <span
                        className={`cv-chip cv-chip--${chip.tone}`}
                        title={effective === "stuck" ? p.rebuild_stuck_reason ?? undefined : undefined}
                      >
                        {chip.label}
                      </span>
                    </span>
                  </button>
                );
              })}
            </section>

            {current && (
              <section
                className="cv-card cv-card-pad"
                style={{
                  flex: isMobile ? "1 1 auto" : "3 1 520px", width: isMobile ? "100%" : undefined,
                  order: isMobile ? 1 : undefined,
                  minWidth: 0, display: "flex", flexDirection: "column", gap: 16,
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                    <h2 className="cv-card-title">{current.company}</h2>
                    <div style={{ fontSize: 14, color: "var(--cv-muted)" }}>
                      {[current.trade, current.city].filter(Boolean).join(" · ") || "No sector on file"}
                    </div>
                  </div>
                  <span className="cv-viewseg" role="group" aria-label="Compare">
                    <button
                      type="button"
                      className={`cv-viewseg__btn ${compare === "new" ? "cv-viewseg__btn--on" : ""}`}
                      onClick={() => setCompare("new")}
                    >
                      New design
                    </button>
                    <button
                      type="button"
                      className={`cv-viewseg__btn ${compare === "current" ? "cv-viewseg__btn--on" : ""}`}
                      onClick={() => setCompare("current")}
                      disabled={!current.current_site_url}
                      title={current.current_site_url ? undefined : "No current site on file for this prospect"}
                    >
                      Current site
                    </button>
                  </span>
                  <button
                    type="button"
                    className="cv-open"
                    style={{ padding: "0 16px", minHeight: 44 }}
                    disabled={!previewSrc}
                    onClick={() => openInNewTab(previewSrc)}
                  >
                    Open full page <ExternalLink size={14} style={{ marginLeft: 6 }} />
                  </button>
                </div>

                <div className="cv-screen">
                  {previewSrc ? (
                    <div className="cv-screen__page">
                      <iframe
                        key={`${current.id}:${compare}`}
                        src={previewSrc}
                        title={`${current.company} — ${compare === "new" ? "new design" : "current site"}`}
                        // The new design is ours and frames fine. A
                        // prospect's own site often sends X-Frame-Options
                        // and renders blank, which is why Open full page
                        // sits above it rather than being the fallback.
                        sandbox="allow-scripts allow-same-origin allow-popups"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                      />
                    </div>
                  ) : posterSrc ? (
                    <div className="cv-screen__page"><img src={posterSrc} alt={`${current.company} preview`} /></div>
                  ) : (
                    <div className="cv-screen__none">
                      {compare === "current"
                        ? "No current site on file for this prospect."
                        : "No preview built for this prospect yet."}
                    </div>
                  )}
                </div>

                {compare === "current" && (
                  <p style={{ margin: 0, fontSize: 12, color: "var(--cv-muted)" }}>
                    Some sites refuse to be embedded and show blank here — use
                    Open full page.
                  </p>
                )}

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <button
                    type="button"
                    className="cv-open cv-open--go"
                    style={{ flex: "2 1 180px" }}
                    disabled={busyId === current.id || current.status === "approved"}
                    onClick={() => approve(current.id)}
                  >
                    <Check size={16} style={{ marginRight: 7 }} />
                    {current.status === "approved" ? "Approved" : "Approve"}
                  </button>
                  <button
                    type="button"
                    className="cv-open cv-open--dark"
                    style={{ flex: "2 1 180px" }}
                    disabled={busyId === current.id}
                    onClick={() => setPanelId(current.id)}
                  >
                    <RefreshCw size={16} style={{ marginRight: 7 }} /> Redesign
                  </button>
                  <button
                    type="button"
                    className="cv-open"
                    style={{ flex: "1 1 100px" }}
                    disabled={busyId === current.id}
                    onClick={() => skip(current.id)}
                  >
                    Skip
                  </button>
                </div>

                {current.hook && (
                  <p style={{ margin: 0, fontSize: 13, color: "var(--cv-muted)" }}>{current.hook}</p>
                )}
              </section>
            )}
          </div>
        )}

        <ProspectFeedbackPanel
          prospect={panelProspect}
          history={panelHistory}
          note={panelId ? noteDrafts[panelId] ?? "" : ""}
          attachments={panelAttachments}
          busy={!!panelId && busyId === panelId}
          onNote={(v) => panelId && setNoteDrafts((d) => ({ ...d, [panelId]: v }))}
          onAddFiles={(files) => panelId && addAttachmentFiles(panelId, files)}
          onRemoveFile={(i) => panelId && removeAttachmentDraft(panelId, i)}
          onClose={() => setPanelId(null)}
          onSendBack={async () => {
            if (!panelId) return;
            const id = panelId;
            await decide(id, "rejected");
            advance(id);
          }}
        />

      </div>
    </AdminLayout>
  );
}

/**
 * Redesign: the feedback the rebuild is based on, then send it back.
 *
 * A side panel rather than a field on the card, because this is the one
 * action on the page that takes more than a glance — and because the
 * rounds already left on this prospect have to be readable while you
 * write the next one, or you repeat yourself.
 */
function ProspectFeedbackPanel({
  prospect, history, note, attachments, busy,
  onNote, onAddFiles, onRemoveFile, onClose, onSendBack,
}: {
  prospect: Prospect | null;
  history: FeedbackRound[] | null;
  note: string;
  attachments: AttachmentDraft[];
  busy: boolean;
  onNote: (v: string) => void;
  onAddFiles: (files: FileList | null) => void;
  onRemoveFile: (i: number) => void;
  onClose: () => void;
  onSendBack: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <SidePanel
      open={!!prospect}
      onClose={onClose}
      title="Send back for a redesign"
      subtitle={prospect?.company}
      width={560}
    >
      {prospect && (
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <label className="cv-field">
            What needs to change
            <textarea
              className="cv-textarea" rows={6} value={note} autoFocus
              onChange={(e) => onNote(e.target.value)}
              placeholder="Hero image is the wrong trade, phone number is out of date…"
            />
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="cv-mini" onClick={() => fileRef.current?.click()}>
              <Paperclip size={14} style={{ marginRight: 6 }} /> Attach
            </button>
            <span style={{ fontSize: 12, color: "var(--cv-muted)" }}>PNG, JPEG, WebP or PDF, up to 10&nbsp;MB</span>
            <input
              ref={fileRef} type="file" multiple hidden
              accept={ACCEPTED_ATTACHMENT_TYPES.join(",")}
              onChange={(e) => { onAddFiles(e.target.files); e.target.value = ""; }}
            />
          </div>

          {attachments.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {attachments.map((a, i) => (
                <span key={i} className="cv-chip cv-chip--gray" style={{ gap: 8 }}>
                  {a.previewUrl
                    ? <img src={a.previewUrl} alt="" style={{ width: 22, height: 22, borderRadius: 4, objectFit: "cover" }} />
                    : <FileText size={14} />}
                  {a.file.name}
                  <button
                    type="button" aria-label={`Remove ${a.file.name}`}
                    onClick={() => onRemoveFile(i)}
                    style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", padding: 0, display: "inline-flex" }}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <button
            type="button" className="cv-open cv-open--dark" style={{ padding: "0 22px" }}
            disabled={busy} onClick={onSendBack}
          >
            {busy ? "Sending…" : "Send back"}
          </button>

          <div className="cv-rule" />

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <History size={15} />
            <span style={{ fontWeight: 600, fontSize: 15 }}>Earlier rounds</span>
          </div>
          {history === null ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--cv-muted)" }}>Loading…</p>
          ) : !history.length ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--cv-muted)" }}>
              Nothing sent back on this prospect yet.
            </p>
          ) : history.map((r) => (
            <div key={r.id} className="cv-lg" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--cv-muted)" }}>
                <span className="cv-chip cv-chip--gray">Round {r.round}</span>
                <span>{r.preview_version}</span>
                <span>{formatCT(r.created_at)}</span>
                {r.created_by && <span>· {r.created_by}</span>}
              </div>
              {r.notes && <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{r.notes}</div>}
              {r.attachments.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {r.attachments.map((a, i) => (
                    a.signed_url ? (
                      <a key={i} className="cv-chip cv-chip--gray" href={a.signed_url} target="_blank" rel="noreferrer">
                        <FileText size={13} /> {a.file_name}
                      </a>
                    ) : (
                      <span key={i} className="cv-chip cv-chip--gray"><FileText size={13} /> {a.file_name}</span>
                    )
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SidePanel>
  );
}
