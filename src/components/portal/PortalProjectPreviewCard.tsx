// What the client is here to look at.
//
// Rebuilt to the Cre8 Visions portal canvas: the page tree on the left, the
// page they picked on the right, and the two things they can do with it —
// open it, or approve it — as the only two buttons on the panel.
//
// The data layer is unchanged. preview-approvals is the client's read/write
// surface and it already returns folders and approvals; this is a new render
// over the same calls.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, ExternalLink, Folder, Info, X } from "lucide-react";
import { toast } from "sonner";
import { T, groupSummary } from "@/lib/cre8Design";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Approval = { approver_name: string | null; approved_at: string } | null;
type PageRow = {
  path: string; label?: string | null; isEntry: boolean; isExternal?: boolean;
  viewUrl?: string | null; group?: string | null; approval: Approval;
};
type AssetRow = { path: string; approval: Approval };
type ListResp = {
  project: {
    id: string; name: string; slug: string; entry_path: string;
    source_type?: string; external_base_url?: string | null; has_external?: boolean;
  };
  pages: PageRow[];
  assets: AssetRow[];
};

type Props = {
  clientProjectId: string;
  contactName?: string | null;
  clientId?: string;
  /** Lets the page header show the same count without loading it twice. */
  onProgress?: (p: { approved: number; total: number }) => void;
};

async function call(body: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/preview-approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
    body: JSON.stringify(body),
  });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}

const TIP_KEY = "cre8-portal-preview-tip";

export default function PortalProjectPreviewCard({
  clientProjectId, contactName, onProgress,
}: Props) {
  const [list, setList] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [approverDraft, setApproverDraft] = useState(contactName ?? "");
  const [selected, setSelected] = useState<string | null>(null);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [tipOpen, setTipOpen] = useState(true);

  useEffect(() => { setApproverDraft(contactName ?? ""); }, [contactName]);

  // Dismissed for good, per browser. Wrapped because private windows throw.
  useEffect(() => {
    try { if (localStorage.getItem(TIP_KEY)) setTipOpen(false); } catch { /* keep it */ }
  }, []);
  const dismissTip = () => {
    setTipOpen(false);
    try { localStorage.setItem(TIP_KEY, new Date().toISOString()); } catch { /* fine */ }
  };

  const base = useMemo(() => window.location.origin, []);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await call({ action: "list", client_project_id: clientProjectId });
    if (r.ok) setList(r.data as ListResp);
    else setList(null);
    setLoading(false);
  }, [clientProjectId]);

  useEffect(() => { void load(); }, [load]);

  const totalItems = (list?.pages.length ?? 0) + (list?.assets.length ?? 0);
  const approvedItems =
    (list?.pages.filter((p) => p.approval).length ?? 0)
    + (list?.assets.filter((a) => a.approval).length ?? 0);

  useEffect(() => {
    onProgress?.({ approved: approvedItems, total: totalItems });
  }, [approvedItems, totalItems, onProgress]);

  const setApproval = async (kind: "page" | "asset", path: string, approve: boolean) => {
    if (!list) return;
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
    if (!r.ok) {
      toast.error((r.data as { error?: string })?.error || "Could not save approval");
      return;
    }
    toast.success(approve ? "Approved" : "Approval removed");
    await load();
  };

  /*
   * Pages, in folders.
   *
   * The folder comes from the page's own group_label, so one project can hold
   * three rounds of concepts and a finished website without them reading as
   * one undifferentiated list. Falls back to the kind when a page has no
   * folder yet, which is what every page looked like before this existed.
   *
   * Insertion order is preserved rather than sorted: the server already
   * returns pages in order_index order, so the first folder a page appears in
   * decides where that folder sits.
   */
  const folders = useMemo(() => {
    if (!list) return [];
    const byTitle = new Map<string, { title: string; note?: string; pages: PageRow[] }>();
    for (const p of list.pages) {
      const title = p.group || (p.isExternal ? "Website pages" : "Design concepts");
      const existing = byTitle.get(title);
      if (existing) existing.pages.push(p);
      else {
        byTitle.set(title, {
          title,
          note: p.isExternal
            ? "These open on your live site. Use the comment button beside the page."
            : undefined,
          pages: [p],
        });
      }
    }
    return [...byTitle.values()];
  }, [list]);

  const allPages = useMemo(() => folders.flatMap((f) => f.pages), [folders]);

  useEffect(() => {
    if (selected || !allPages.length) return;
    setSelected(allPages[0].path);
  }, [allPages, selected]);

  if (loading) return null;

  if (!list) {
    return (
      <section style={{
        border: T.hairline, borderRadius: T.radius, background: T.panel, padding: "18px 20px",
      }}>
        <h2 style={{ fontFamily: T.serif, fontSize: 22, fontWeight: 500, color: T.text, margin: 0 }}>
          Preview
        </h2>
        <p style={{ fontSize: 15, color: T.muted, margin: "8px 0 0" }}>
          Your preview link isn't ready yet. We'll let you know the moment it's available.
        </p>
      </section>
    );
  }

  const current = allPages.find((p) => p.path === selected) ?? null;
  const currentFolder = folders.find((f) => f.pages.some((p) => p.path === selected));
  const pageUrl = (row: PageRow) => row.viewUrl || `${base}/p/${list.project.slug}/${row.path}`;
  const labelFor = (row: PageRow) =>
    row.label?.trim() || row.path.replace(/\.html?$/i, "").split("/").pop() || row.path;

  return (
    <section style={{
      border: T.hairline, borderRadius: T.radius, background: T.panel,
      display: "flex", flexDirection: "column", minWidth: 0,
    }}>
      <header style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 18px",
        borderBottom: T.hairline, flexWrap: "wrap",
      }}>
        <h2 style={{ fontFamily: T.serif, fontSize: 22, fontWeight: 500, color: T.text, margin: 0 }}>
          Preview
        </h2>
        <span style={{ fontSize: 14, color: T.text2 }}>
          {list.pages.length} page{list.pages.length === 1 ? "" : "s"}
        </span>

        {/* Asked for once, at the top, rather than per approval. Approving is
            a signature — it has to carry a name, and being stopped by that
            after clicking Approve is a worse moment to discover it. */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <label htmlFor="portal-approver" style={{ fontSize: 14, color: T.muted }}>Your name</label>
          <input
            id="portal-approver"
            value={approverDraft}
            onChange={(e) => setApproverDraft(e.target.value)}
            placeholder="So we know who approved it"
            style={{
              fontSize: 14, color: T.text, background: T.ink, border: T.hairline,
              borderRadius: T.radiusSm, padding: "8px 11px", minWidth: 190, fontFamily: "inherit",
            }}
          />
        </div>
      </header>

      {tipOpen && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 18px",
          borderBottom: T.hairline, background: T.noticeBg,
        }}>
          <Info size={16} color={T.bronze} style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 14, color: T.text2, margin: 0, flex: 1, lineHeight: 1.5 }}>
            Open a page and use the comment button on it. Click anywhere to pin a
            note to that exact spot. Approve a page here once you're happy with it.
          </p>
          <button
            type="button" onClick={dismissTip} aria-label="Dismiss"
            style={{
              background: "none", border: "none", cursor: "pointer", color: T.muted, padding: "1px 6px",
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(0, 1fr)" }}>
        <div style={{ borderRight: T.hairline, padding: "6px 0 10px", minWidth: 0 }}>
          {!folders.length && (
            <p style={{ padding: "18px 20px", fontSize: 15, color: T.muted, margin: 0 }}>
              Nothing to look at yet. We'll let you know when there is.
            </p>
          )}
          {folders.map((f) => {
            const open = openFolders[f.title] !== false;
            const done = f.pages.filter((p) => p.approval).length;
            return (
              <div key={f.title}>
                <button
                  type="button"
                  onClick={() => setOpenFolders((o) => ({ ...o, [f.title]: !open }))}
                  aria-expanded={open}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "8px 20px", background: "transparent", border: "none",
                    cursor: "pointer", color: T.text, textAlign: "left",
                  }}
                >
                  {open ? <ChevronDown size={14} color={T.muted} /> : <ChevronRight size={14} color={T.muted} />}
                  <Folder size={14} color={T.muted} />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{f.title}</span>
                  <span style={{ fontSize: 14, color: T.muted }}>
                    · {groupSummary(f.pages.length, done)}
                  </span>
                </button>

                {open && f.pages.map((p) => {
                  const on = p.path === selected;
                  const approved = !!p.approval;
                  return (
                    <button
                      key={p.path}
                      type="button"
                      onClick={() => setSelected(p.path)}
                      aria-current={on}
                      style={{
                        display: "grid", gridTemplateColumns: "1fr auto", gap: 10,
                        alignItems: "center", width: "100%", padding: "7px 18px 7px 42px",
                        background: on ? T.rowActive : "transparent",
                        border: "none", borderLeft: `2px solid ${on ? T.bronze : "transparent"}`,
                        cursor: "pointer", textAlign: "left", color: T.text,
                      }}
                    >
                      <span style={{
                        fontSize: 15, fontWeight: on ? 500 : 400,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {labelFor(p)}
                        {p.isEntry && <span style={{ color: T.muted, fontWeight: 400 }}> · entry</span>}
                      </span>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14,
                        fontWeight: 500, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap",
                        color: approved ? T.green : T.text2,
                        background: approved ? T.greenBg : T.rowActive,
                      }}>
                        <span style={{
                          width: 5, height: 5, borderRadius: "50%",
                          background: approved ? T.green : T.text2,
                        }} />
                        {approved ? "Approved" : "To review"}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={{ padding: "16px 18px", minWidth: 0 }}>
          {!current ? (
            <p style={{ fontSize: 15, color: T.muted, margin: 0 }}>Pick a page to look at it.</p>
          ) : (
            <>
              <div style={{ fontSize: 14, color: T.muted }}>{currentFolder?.title} /</div>
              <div style={{ fontSize: 17, fontWeight: 500, color: T.text }}>{labelFor(current)}</div>

              <div style={{
                marginTop: 12, height: 190, borderRadius: 8, border: T.hairline,
                display: "grid", placeItems: "center",
                background: "repeating-linear-gradient(135deg, rgba(244,239,233,0.03) 0 8px, transparent 8px 16px)",
                color: T.muted, fontSize: 14,
              }}>
                Page preview
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
                <a
                  href={pageUrl(current)} target="_blank" rel="noreferrer"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: 500,
                    padding: "8px 14px", borderRadius: T.radiusSm, textDecoration: "none",
                    background: T.text, color: "rgb(27, 25, 21)",
                  }}
                >
                  <ExternalLink size={14} /> Open &amp; comment
                </a>
                <button
                  type="button"
                  disabled={busy === `page:${current.path}`}
                  onClick={() => void setApproval("page", current.path, !current.approval)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7, fontSize: 14, fontWeight: 500,
                    padding: "8px 14px", borderRadius: T.radiusSm, border: "none", cursor: "pointer",
                    background: current.approval ? "transparent" : T.bronzeBtn,
                    color: current.approval ? T.text2 : T.bronzeBtnText,
                    boxShadow: current.approval ? `inset 0 0 0 1px rgba(244,239,233,0.09)` : undefined,
                  }}
                >
                  <Check size={14} />
                  {busy === `page:${current.path}`
                    ? "Saving…"
                    : current.approval ? "Approved — undo" : "Approve page"}
                </button>
              </div>

              <p style={{ fontSize: 14, color: T.muted, margin: "10px 0 0", lineHeight: 1.5 }}>
                {current.approval
                  ? `Approved by ${current.approval.approver_name || "you"} on ${new Date(current.approval.approved_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.`
                  : currentFolder?.note
                    ?? "Comments you leave on the page go straight to the team."}
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
