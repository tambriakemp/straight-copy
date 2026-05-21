import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Approval = { approver_name: string | null; approved_at: string } | null;
type PageRow = { path: string; label?: string | null; isEntry: boolean; isExternal?: boolean; viewUrl?: string | null; approval: Approval };
type AssetRow = { path: string; approval: Approval };
type ListResp = {
  project: { id: string; name: string; slug: string; entry_path: string; source_type?: string; external_base_url?: string | null; has_external?: boolean };
  pages: PageRow[];
  assets: AssetRow[];
};

type Props = { clientProjectId: string; contactName?: string | null };

async function call(body: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/preview-approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
    body: JSON.stringify(body),
  });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}

export default function PortalProjectPreviewCard({ clientProjectId, contactName }: Props) {
  const [list, setList] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [approverDraft, setApproverDraft] = useState(contactName ?? "");

  useEffect(() => { setApproverDraft(contactName ?? ""); }, [contactName]);

  const base = useMemo(() => window.location.origin, []);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await call({ action: "list", client_project_id: clientProjectId });
    if (r.ok) setList(r.data as ListResp);
    else setList(null);
    setLoading(false);
  }, [clientProjectId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return null;

  if (!list) {
    return (
      <section className="portal-access is-open" style={{ scrollMarginTop: 24 }}>
        <div className="portal-access__toggle" style={{ cursor: "default" }}>
          <div className="portal-access__toggle-left">
            <div className="portal-access__eyebrow">Preview</div>
            <h2 className="portal-access__title">Coming <em>soon</em>.</h2>
          </div>
        </div>
        <div className="portal-access__body">
          <p className="portal-access__intro">
            Your preview link isn't ready yet. We'll let you know the moment it's available.
          </p>
        </div>
      </section>
    );
  }

  const pageUrl = (row: PageRow) =>
    row.viewUrl || `${base}/p/${list.project.slug}/${row.path}`;
  const assetUrl = (path: string) => `${base}/p/${list.project.slug}/${path}`;

  const uploadedPages = list.pages.filter((p) => !p.isExternal);
  const externalPages = list.pages.filter((p) => p.isExternal);

  const totalItems = list.pages.length + list.assets.length;
  const approvedItems =
    list.pages.filter((p) => p.approval).length + list.assets.filter((a) => a.approval).length;

  const setApproval = async (kind: "page" | "asset", path: string, approve: boolean) => {
    const key = `${kind}:${path}`;
    if (approve && !approverDraft.trim()) {
      toast.error("Please enter your name before approving.");
      return;
    }
    setBusy(key);
    const r = await call({
      action: approve ? "approve" : "unapprove",
      slug: list.project.slug,
      kind,
      path,
      approver_name: approverDraft.trim() || null,
    });
    setBusy(null);
    if (!r.ok) { toast.error((r.data as any)?.error || "Could not save approval"); return; }
    toast.success(approve ? "Approved" : "Approval removed");
    await load();
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const labelForPath = (p: string) =>
    p.replace(/\.html?$/i, "").split("/").pop() || p;

  return (
    <section className="portal-access is-open" style={{ scrollMarginTop: 24 }}>
      <div className="portal-access__toggle" style={{ cursor: "default" }}>
        <div className="portal-access__toggle-left">
          <div className="portal-access__eyebrow">Preview</div>
          <h2 className="portal-access__title">{list.project.name}</h2>
        </div>
        <div className="portal-access__toggle-right">
          <span className="portal-access__status">
            {totalItems > 0 ? `${approvedItems} of ${totalItems} approved` : "Live"}
          </span>
        </div>
      </div>
      <div className="portal-access__body">
        <p className="portal-access__intro">
          Open the latest preview in a new tab. Use the in-page comment tools to leave feedback,
          and approve each page or asset below once it's good to go.
        </p>

        {totalItems > 0 && (
          <>
            <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <label style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(30 8% 62%)" }}>
                Your name
              </label>
              <input
                value={approverDraft}
                onChange={(e) => setApproverDraft(e.target.value)}
                placeholder="Required to approve"
                style={{
                  flex: "1 1 220px",
                  background: "transparent",
                  border: "1px solid hsl(30 8% 22%)",
                  borderRadius: 6,
                  padding: "8px 12px",
                  color: "hsl(40 20% 97%)",
                  fontSize: 14,
                }}
              />
            </div>

            {list.pages.length > 0 && (
              <ApprovalGroup
                title="Pages"
                rows={list.pages.map((p) => ({
                  key: p.path,
                  label: (p.label || labelForPath(p.path)) + (p.isEntry ? " · entry" : ""),
                  sub: p.path,
                  viewUrl: pageUrl(p.path),
                  approval: p.approval,
                  onApprove: (v: boolean) => setApproval("page", p.path, v),
                  busy: busy === `page:${p.path}`,
                  showComments: isExternal,
                  slug: list.project.slug,
                  path: p.path,
                }))}
                fmtDate={fmtDate}
              />
            )}

            {list.assets.length > 0 && (
              <ApprovalGroup
                title="Assets"
                rows={list.assets.map((a) => ({
                  key: a.path,
                  label: a.path.split("/").pop() || a.path,
                  sub: a.path,
                  viewUrl: pageUrl(a.path),
                  approval: a.approval,
                  onApprove: (v: boolean) => setApproval("asset", a.path, v),
                  busy: busy === `asset:${a.path}`,
                }))}
                fmtDate={fmtDate}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}

type Row = {
  key: string;
  label: string;
  sub: string;
  viewUrl: string;
  approval: Approval;
  onApprove: (v: boolean) => void;
  busy: boolean;
  showComments?: boolean;
  slug?: string;
  path?: string;
};

function ApprovalGroup({ title, rows, fmtDate }: { title: string; rows: Row[]; fmtDate: (s: string) => string }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "hsl(30 8% 62%)", marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => {
          const approved = !!r.approval;
          return (
            <div
              key={r.key}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: "12px 14px",
                border: "1px solid hsl(30 8% 22%)",
                borderRadius: 6,
                background: approved ? "hsl(30 6% 12%)" : "transparent",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 14 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: "hsl(40 20% 97%)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.label}
                  </div>
                  <div style={{ fontSize: 11, color: "hsl(30 8% 55%)", marginTop: 3, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.sub}
                  </div>
                  {approved && r.approval && (
                    <div style={{ fontSize: 11, color: "hsl(140 30% 60%)", marginTop: 4, letterSpacing: "0.06em" }}>
                      ✓ Approved{r.approval.approver_name ? ` by ${r.approval.approver_name}` : ""} · {fmtDate(r.approval.approved_at)}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <a className="crm-btn crm-btn--ghost crm-btn--sm" href={r.viewUrl} target="_blank" rel="noreferrer" title="View in new tab">
                    <ExternalLink size={12} /> View
                  </a>
                  {approved ? (
                    <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => r.onApprove(false)} disabled={r.busy} title="Remove approval">
                      {r.busy ? <Loader2 size={12} className="animate-spin" /> : "Undo"}
                    </button>
                  ) : (
                    <button className="crm-btn crm-btn--bronze crm-btn--sm" onClick={() => r.onApprove(true)} disabled={r.busy}>
                      {r.busy ? <Loader2 size={12} className="animate-spin" /> : <><Check size={12} /> Approve</>}
                    </button>
                  )}
                </div>
              </div>
              {r.showComments && r.slug && r.path !== undefined && (
                <PageCommentThread slug={r.slug} path={r.path} fmtDate={fmtDate} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Comment = { id: string; author_name: string | null; body: string; created_at: string };

function PageCommentThread({ slug, path, fmtDate }: { slug: string; path: string; fmtDate: (s: string) => string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const url = new URL(`${SUPABASE_URL}/functions/v1/preview-page-comments`);
    url.searchParams.set("slug", slug);
    url.searchParams.set("path", path);
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${PUB_KEY}`, apikey: PUB_KEY } });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setComments(j.comments || []);
    setLoaded(true);
  }, [slug, path]);

  useEffect(() => { if (open && !loaded) void load(); }, [open, loaded, load]);

  const submit = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    const r = await fetch(`${SUPABASE_URL}/functions/v1/preview-page-comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}`, apikey: PUB_KEY },
      body: JSON.stringify({ slug, path, author_name: name.trim() || null, body: text }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.error(j?.error || "Could not send comment"); return; }
    setBody("");
    setComments((prev) => [...prev, j.comment]);
    toast.success("Comment sent");
  };

  return (
    <div style={{ borderTop: "1px dashed hsl(30 8% 22%)", paddingTop: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="crm-btn crm-btn--ghost crm-btn--sm"
        style={{ alignSelf: "flex-start" }}
      >
        <MessageSquare size={12} /> {open ? "Hide" : "Comments"}{comments.length > 0 ? ` (${comments.length})` : ""}
      </button>
      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {loaded && comments.length === 0 && (
            <div style={{ fontSize: 12, color: "hsl(30 8% 55%)" }}>No comments yet. Be the first to leave feedback.</div>
          )}
          {comments.map((c) => (
            <div key={c.id} style={{ background: "hsl(30 6% 10%)", border: "1px solid hsl(30 8% 18%)", borderRadius: 4, padding: "8px 10px" }}>
              <div style={{ fontSize: 11, color: "hsl(30 8% 62%)", marginBottom: 4, letterSpacing: "0.06em" }}>
                {c.author_name || "Anonymous"} · {fmtDate(c.created_at)}
              </div>
              <div style={{ fontSize: 13, color: "hsl(40 20% 95%)", whiteSpace: "pre-wrap" }}>{c.body}</div>
            </div>
          ))}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (optional)"
              style={{ background: "transparent", border: "1px solid hsl(30 8% 22%)", borderRadius: 4, padding: "6px 10px", color: "hsl(40 20% 97%)", fontSize: 13 }}
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share feedback for this page…"
              rows={3}
              style={{ background: "transparent", border: "1px solid hsl(30 8% 22%)", borderRadius: 4, padding: "8px 10px", color: "hsl(40 20% 97%)", fontSize: 13, fontFamily: "inherit", resize: "vertical" }}
            />
            <button className="crm-btn crm-btn--bronze crm-btn--sm" onClick={submit} disabled={busy || !body.trim()} style={{ alignSelf: "flex-end" }}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : <><Send size={12} /> Send</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
