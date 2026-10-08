import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check, Copy, ExternalLink, Eye, EyeOff, FileText, History, Paperclip, RefreshCw, Send, Settings, Upload, X,
} from "lucide-react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import PageHeader from "@/components/admin/cv/PageHeader";
import EmptyState from "@/components/admin/cv/EmptyState";
import StatusChip from "@/components/admin/cv/StatusChip";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";

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

const STATUS_LABEL: Record<Status, string> = { pending: "Pending", approved: "Approved", rejected: "Rejected" };

function openInNewTab(url: string | null | undefined) {
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

function randomSecret(len = 40) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, len);
}

// Same Settings-card pattern as Briefs.tsx's SecretRow, duplicated locally
// rather than extracted into a shared component — each settings-bearing
// admin page owns its own copy today (see Briefs.tsx, Audits.tsx).
function SecretRow({ label, secretKey, hint }: { label: string; secretKey: string; hint: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    db.from("app_secrets").select("value").eq("key", secretKey).maybeSingle()
      .then(({ data }: { data: { value: string } | null }) => { setValue(data?.value ?? null); setLoaded(true); });
  }, [secretKey]);

  const save = async (next: string) => {
    setBusy(true);
    const { error } = await db.from("app_secrets")
      .upsert({ key: secretKey, value: next, rotated_at: new Date().toISOString() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setValue(next);
    setRevealed(true);
    toast.success(`${label} saved`);
  };

  const copy = () => { if (value) { navigator.clipboard.writeText(value); toast.success("Copied"); } };

  return (
    <div style={{ display: "grid", gap: 6, marginBottom: 18 }}>
      <label className="crm-label">{label}</label>
      <p style={{ fontSize: 15, color: "hsl(30 8% 62%)", margin: 0 }}>{hint}</p>
      {!loaded ? (
        <div style={{ fontSize: 15, color: "hsl(30 8% 62%)" }}>Loading…</div>
      ) : value ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <code style={{
            flex: 1, fontFamily: "monospace", fontSize: 15, color: "hsl(40 20% 97%)",
            background: "hsl(40 8% 10%)", padding: "8px 10px", border: "1px solid hsl(40 20% 97% / 0.08)",
            wordBreak: "break-all",
          }}>
            {revealed ? value : "•".repeat(Math.min(value.length, 32))}
          </code>
          <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => setRevealed((r) => !r)}>
            {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </button>
          <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={copy}>
            <Copy className="h-3 w-3" />
          </button>
          <button className="crm-btn crm-btn--ghost crm-btn--sm" disabled={busy}
            onClick={() => { if (confirm(`Rotate ${label}? Anything using the old value stops working immediately.`)) save(randomSecret()); }}>
            <RefreshCw className="h-3 w-3" /> Rotate
          </button>
        </div>
      ) : (
        <button className="crm-btn crm-btn--bronze crm-btn--sm" disabled={busy} onClick={() => save(randomSecret())}>
          Generate
        </button>
      )}
    </div>
  );
}

export default function Approvals() {
  const { user } = useAdminAuth();
  const [prospects, setProspects] = useState<Prospect[] | null>(null);
  const [batch, setBatch] = useState<string>("all");
  const [status, setStatus] = useState<"all" | Status>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [panelId, setPanelId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [attachmentDrafts, setAttachmentDrafts] = useState<Record<string, AttachmentDraft[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelHistory, setPanelHistory] = useState<FeedbackRound[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data, error } = await db.from("prospect_approvals").select("*")
      .order("batch", { ascending: false }).order("created_at", { ascending: true });
    if (error) { toast.error(error.message); return; }
    setProspects((data ?? []) as Prospect[]);
  };
  useEffect(() => { load(); }, []);

  const batches = useMemo(() => {
    const set = new Set((prospects ?? []).map((p) => p.batch));
    return Array.from(set).sort().reverse();
  }, [prospects]);

  // Default to the most recent batch once it's known, rather than "all" —
  // a big outreach round should open already scoped to this week's work.
  useEffect(() => {
    if (batch === "all" && batches.length) setBatch(batches[0]);
  }, [batches, batch]);

  const scoped = useMemo(
    () => (prospects ?? []).filter((p) => batch === "all" || p.batch === batch),
    [prospects, batch],
  );
  const filtered = useMemo(
    () => scoped.filter((p) => status === "all" || p.status === status),
    [scoped, status],
  );
  const counts = useMemo(() => ({
    all: scoped.length,
    pending: scoped.filter((p) => p.status === "pending").length,
    approved: scoped.filter((p) => p.status === "approved").length,
    rejected: scoped.filter((p) => p.status === "rejected").length,
  }), [scoped]);

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
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
    setPanelId((p) => (p === id ? null : p));
    load();
  };

  const bulkApprove = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const { error } = await db.from("prospect_approvals").update({
      status: "approved",
      decided_at: new Date().toISOString(),
      decided_by: user?.email ?? null,
      updated_at: new Date().toISOString(),
    }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`Approved ${ids.length}`);
    setSelected(new Set());
    load();
  };

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

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

  const panelProspect = filtered.find((p) => p.id === panelId) ?? null;
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

  return (
    <AdminLayout>
      <div className="cv-admin" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <PageHeader
          eyebrow="Daily / Prospects"
          title="Prospect approvals"
          subtitle={
            <>
              Review this batch's redesigns and send copy before Monday's send.{" "}
              <Link to="/admin/today" style={{ color: "var(--cv-accent)" }}>Today →</Link>
            </>
          }
          right={
            <button
              type="button"
              className="cv-sync-btn"
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          }
        />

        <div style={{ padding: "0 32px 32px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
            <select
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              aria-label="Choose batch"
              style={{
                fontSize: 13, color: "var(--cv-body)", background: "var(--cv-card)",
                border: "1px solid var(--cv-border-strong)", borderRadius: "var(--cv-r-sm)",
                padding: "7px 10px", fontFamily: "var(--cv-font-sans)", minWidth: 180,
              }}
            >
              <option value="all">All batches</option>
              {batches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <div className="cv-filter-tabs">
              {(["pending", "approved", "rejected", "all"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`cv-filter-tab ${status === s ? "cv-filter-tab--active" : ""}`}
                  onClick={() => setStatus(s)}
                >
                  {s === "all" ? "All" : STATUS_LABEL[s]} {counts[s]}
                </button>
              ))}
            </div>
            {selected.size > 0 && (
              <button className="cv-btn-primary" onClick={bulkApprove} style={{ marginLeft: "auto" }}>
                <Check className="h-3 w-3" /> Approve {selected.size} selected
              </button>
            )}
          </div>

          {!prospects ? (
            <div style={{ fontSize: 14, color: "var(--cv-muted)" }}>Loading…</div>
          ) : !filtered.length ? (
            <EmptyState title="Nothing here" subtitle={`No ${status === "all" ? "" : status} prospects in this batch.`} />
          ) : (
            <div className="cv-card" style={{ overflow: "hidden" }}>
              {filtered.map((p, i) => (
                <div
                  key={p.id}
                  style={{
                    display: "grid", gridTemplateColumns: "28px 72px 2fr 0.7fr 2.4fr", gap: 14,
                    alignItems: "center", padding: "14px 16px",
                    borderTop: i === 0 ? "none" : "1px solid var(--cv-border)",
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={p.status !== "pending"}
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  {p.preview_url ? (
                    <img
                      src={p.preview_image_url ?? `${p.preview_url.replace(/\/$/, "")}/preview.jpg`}
                      alt={p.company}
                      style={{ width: 64, height: 48, objectFit: "cover", background: "var(--cv-sunken)", borderRadius: "var(--cv-r-sm)" }}
                      onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                    />
                  ) : <div style={{ width: 64, height: 48, background: "var(--cv-sunken)", borderRadius: "var(--cv-r-sm)" }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, color: "var(--cv-ink)" }}>{p.company}</div>
                    <div style={{ fontSize: 13, color: "var(--cv-muted)" }}>
                      {p.city}{p.trade ? ` · ${p.trade}` : ""}
                    </div>
                  </div>
                  <div><StatusChip label={STATUS_LABEL[p.status]} status={p.status} /></div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      className="cv-sync-btn"
                      disabled={!p.current_site_url}
                      title={p.current_site_url ? undefined : "No site"}
                      onClick={() => openInNewTab(p.current_site_url)}
                    >
                      Current site
                    </button>
                    <button
                      type="button"
                      className="cv-sync-btn"
                      disabled={!p.preview_url}
                      onClick={() => openInNewTab(p.preview_url)}
                    >
                      Preview <ExternalLink className="h-3 w-3" />
                    </button>
                    {p.status === "pending" && (
                      <>
                        <button
                          type="button"
                          className="cv-sync-btn"
                          onClick={() => setPanelId(p.id)}
                        >
                          + Note
                        </button>
                        <button
                          type="button"
                          className="cv-btn-primary"
                          disabled={busyId === p.id}
                          onClick={() => decide(p.id, "approved")}
                        >
                          <Check className="h-3 w-3" /> Approve
                        </button>
                        <button
                          type="button"
                          className="cv-sync-btn"
                          disabled={busyId === p.id}
                          onClick={() => setPanelId(p.id)}
                        >
                          <X className="h-3 w-3" /> Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Sheet open={!!panelProspect} onOpenChange={(v) => { if (!v) setPanelId(null); }}>
        <SheetContent
          side="right"
          style={{ background: "hsl(36 5% 16%)", color: "hsl(40 20% 97%)", borderColor: "hsl(40 20% 97% / 0.10)" }}
          className="!w-full sm:!max-w-xl overflow-y-auto"
        >
          {panelProspect && (
            <>
              <SheetHeader>
                <SheetTitle className="font-serif italic text-2xl" style={{ color: "hsl(40 20% 97%)" }}>
                  {panelProspect.company}
                </SheetTitle>
                <SheetDescription style={{ fontSize: 15, color: "hsl(30 8% 62%)" }}>
                  {panelProspect.city}{panelProspect.trade ? ` · ${panelProspect.trade}` : ""} · batch {panelProspect.batch}
                </SheetDescription>
              </SheetHeader>

              <div style={{ display: "flex", gap: 8, margin: "14px 0 6px" }}>
                <button
                  type="button"
                  className="crm-btn crm-btn--ghost crm-btn--sm"
                  disabled={!panelProspect.current_site_url}
                  title={panelProspect.current_site_url ? undefined : "No site"}
                  onClick={() => openInNewTab(panelProspect.current_site_url)}
                >
                  Current site
                </button>
                <button
                  type="button"
                  className="crm-btn crm-btn--ghost crm-btn--sm"
                  disabled={!panelProspect.preview_url}
                  onClick={() => openInNewTab(panelProspect.preview_url)}
                >
                  Preview <ExternalLink className="h-3 w-3" />
                </button>
              </div>

              <label className="crm-label" style={{ display: "block", marginTop: 14 }}>
                New round {panelHistory && panelHistory.length > 0 ? `(round ${panelHistory[0].round + 1})` : "(round 1)"}
              </label>
              <textarea
                className="crm-input"
                placeholder="Notes for Nicole — what should change? (encouraged, optional)"
                value={noteDrafts[panelProspect.id] ?? ""}
                onChange={(e) => setNoteDrafts((d) => ({ ...d, [panelProspect.id]: e.target.value }))}
                style={{ width: "100%", minHeight: 140, margin: "8px 0 14px", fontFamily: "inherit" }}
                autoFocus
              />

              <div style={{ marginBottom: 18 }}>
                <label className="crm-label" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Paperclip className="h-3.5 w-3.5" /> Attachments
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_ATTACHMENT_TYPES.join(",")}
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => { addAttachmentFiles(panelProspect.id, e.target.files); e.target.value = ""; }}
                />
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); addAttachmentFiles(panelProspect.id, e.dataTransfer.files); }}
                  onPaste={(e) => {
                    const files = Array.from(e.clipboardData?.files ?? []);
                    if (files.length) addAttachmentFiles(panelProspect.id, files);
                  }}
                  tabIndex={0}
                  style={{
                    border: "1px dashed hsl(40 20% 97% / 0.18)",
                    borderRadius: 8,
                    padding: panelAttachments.length ? 12 : "20px 12px",
                    background: "hsl(40 20% 97% / 0.02)",
                  }}
                >
                  {panelAttachments.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "hsl(30 8% 62%)", fontSize: 14 }}>
                        <Upload className="h-3.5 w-3.5" /> Drop or paste screenshots here, PNG/JPG/WebP/PDF up to 10 MB
                      </div>
                      <button
                        type="button"
                        className="crm-btn crm-btn--ghost crm-btn--sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Paperclip className="h-3 w-3" /> Attach
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
                      {panelAttachments.map((a, i) => (
                        <div key={i} style={{ position: "relative", borderRadius: 6, overflow: "hidden", border: "1px solid hsl(40 20% 97% / 0.12)" }}>
                          {a.previewUrl ? (
                            <img src={a.previewUrl} alt="" style={{ width: "100%", height: 80, objectFit: "cover", display: "block" }} />
                          ) : (
                            <div style={{ width: "100%", height: 80, display: "flex", alignItems: "center", justifyContent: "center", background: "hsl(40 8% 10%)" }}>
                              <FileText className="h-6 w-6" style={{ color: "hsl(30 8% 62%)" }} />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => removeAttachmentDraft(panelProspect.id, i)}
                            style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.7)", border: 0, color: "#fff", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                            aria-label={`Remove ${a.file.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <div style={{ padding: "3px 5px", fontSize: 11, color: "hsl(30 8% 62%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {a.file.name}
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{ minHeight: 80, border: "1px dashed hsl(40 20% 97% / 0.18)", borderRadius: 6, background: "transparent", color: "hsl(30 8% 62%)", cursor: "pointer", fontSize: 13 }}
                      >
                        + Add more
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                className="crm-btn crm-btn--ghost"
                disabled={busyId === panelProspect.id}
                onClick={() => submitRound(panelProspect.id)}
                style={{ marginBottom: 24 }}
              >
                <Send className="h-4 w-4" /> Submit
              </button>

              <div style={{ borderTop: "1px solid hsl(40 20% 97% / 0.10)", paddingTop: 16, marginBottom: 20 }}>
                <label className="crm-label" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <History className="h-3.5 w-3.5" /> History
                </label>
                {panelHistory === null ? (
                  <div style={{ fontSize: 14, color: "hsl(30 8% 62%)" }}>Loading…</div>
                ) : panelHistory.length === 0 ? (
                  <div style={{ fontSize: 14, color: "hsl(30 8% 62%)" }}>No rounds yet.</div>
                ) : (
                  <div style={{ display: "grid", gap: 14 }}>
                    {panelHistory.map((round) => (
                      <div
                        key={round.id}
                        style={{
                          border: "1px solid hsl(40 20% 97% / 0.10)", borderRadius: 8, padding: 12,
                          background: "hsl(40 20% 97% / 0.02)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "hsl(30 8% 62%)", marginBottom: 6 }}>
                          <span>Round {round.round} · {round.preview_version}</span>
                          <span>{formatCT(round.created_at)}</span>
                        </div>
                        {round.notes && (
                          <p style={{ fontSize: 15, whiteSpace: "pre-wrap", margin: "0 0 8px" }}>{round.notes}</p>
                        )}
                        {round.attachments.length > 0 && (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
                            {round.attachments.map((a, i) => (
                              a.signed_url && a.mime_type?.startsWith("image/") ? (
                                <a key={i} href={a.signed_url} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src={a.signed_url} alt={a.file_name}
                                    style={{ width: "100%", height: 64, objectFit: "cover", borderRadius: 4, display: "block" }}
                                  />
                                </a>
                              ) : (
                                <a
                                  key={i} href={a.signed_url ?? undefined} target="_blank" rel="noopener noreferrer"
                                  style={{
                                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                    height: 64, background: "hsl(40 8% 10%)", borderRadius: 4, gap: 4, fontSize: 10,
                                    color: "hsl(30 8% 62%)", textAlign: "center", overflow: "hidden", padding: 4,
                                  }}
                                >
                                  <FileText className="h-5 w-5" />
                                  {a.file_name}
                                </a>
                              )
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="crm-btn crm-btn--bronze" disabled={busyId === panelProspect.id}
                  onClick={() => decide(panelProspect.id, "approved")}
                >
                  <Check className="h-4 w-4" /> Approve
                </button>
                <button
                  className="crm-btn crm-btn--ghost" disabled={busyId === panelProspect.id}
                  onClick={() => decide(panelProspect.id, "rejected")}
                >
                  <X className="h-4 w-4" /> Reject
                </button>
                <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => setPanelId(null)}>Cancel</button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent
          side="right"
          style={{ background: "hsl(36 5% 16%)", color: "hsl(40 20% 97%)", borderColor: "hsl(40 20% 97% / 0.10)" }}
          className="!w-full sm:!max-w-md overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="font-serif italic text-xl" style={{ color: "hsl(40 20% 97%)" }}>Settings</SheetTitle>
            <SheetDescription style={{ fontSize: 17, color: "hsl(30 8% 62%)" }}>
              Key this tab needs. Generated and rotated here — never in Supabase or Lovable.
            </SheetDescription>
          </SheetHeader>
          <div style={{ marginTop: 20 }}>
            <SecretRow
              label="Prospect approvals ingest key" secretKey="prospect_approvals_ingest_secret"
              hint="Save this as a Paperclip secret named PROSPECT-APPROVALS-INGEST-KEY — Ara adds it to Nicole's env from there. Rotating breaks her pushes and decision reads until she has the new value."
            />
          </div>
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
