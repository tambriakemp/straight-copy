import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Check, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Approval = { approver_name: string | null; approved_at: string } | null;
type PageRow = { path: string; isEntry: boolean; approval: Approval };
type AssetRow = { path: string; approval: Approval };
type ListResp = {
  project: { id: string; name: string; slug: string; entry_path: string };
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

// Slug discovery uses the regular client (RLS allows admins; for clients we resolve via the
// edge function below by trying the slug from preview_projects directly).
async function fetchSlug(clientProjectId: string): Promise<string | null> {
  // Use a dedicated lookup via supabase rest with anon (RLS may block this for clients,
  // but the brand-kit-intake `resolve` flow already returns slug-less data — fall back to
  // an admin-managed table read; if blocked we'll show "coming soon").
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase
    .from("preview_projects")
    .select("slug, archived")
    .eq("client_project_id", clientProjectId)
    .maybeSingle();
  if (!data || (data as any).archived) return null;
  return (data as any).slug as string;
}

export default function PortalProjectPreviewCard({ clientProjectId, contactName }: Props) {
  const [list, setList] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
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

  const url = `${base}/p/${slug}`;
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
      slug,
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

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
          <a className="crm-btn crm-btn--bronze crm-btn--sm" href={url} target="_blank" rel="noreferrer">
            <ExternalLink size={12} /> Open preview
          </a>
          <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={copy} title="Copy share link">
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy link"}
          </button>
        </div>

        {totalItems > 0 && (
          <>
            <div style={{ marginTop: 22, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
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
                  label: labelForPath(p.path) + (p.isEntry ? " · entry" : ""),
                  sub: p.path,
                  approval: p.approval,
                  onApprove: (v: boolean) => setApproval("page", p.path, v),
                  busy: busy === `page:${p.path}`,
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
  approval: Approval;
  onApprove: (v: boolean) => void;
  busy: boolean;
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
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) auto",
                alignItems: "center",
                gap: 14,
                padding: "12px 14px",
                border: "1px solid hsl(30 8% 22%)",
                borderRadius: 6,
                background: approved ? "hsl(30 6% 12%)" : "transparent",
              }}
            >
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
              <div>
                {approved ? (
                  <button
                    className="crm-btn crm-btn--ghost crm-btn--sm"
                    onClick={() => r.onApprove(false)}
                    disabled={r.busy}
                    title="Remove approval"
                  >
                    {r.busy ? <Loader2 size={12} className="animate-spin" /> : "Undo"}
                  </button>
                ) : (
                  <button
                    className="crm-btn crm-btn--bronze crm-btn--sm"
                    onClick={() => r.onApprove(true)}
                    disabled={r.busy}
                  >
                    {r.busy ? <Loader2 size={12} className="animate-spin" /> : <><Check size={12} /> Approve</>}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
