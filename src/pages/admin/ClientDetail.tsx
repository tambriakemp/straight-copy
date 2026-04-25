import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { toast } from "sonner";
import { differenceInCalendarDays, format } from "date-fns";
import { syncChecklist, templateIdFor, type ChecklistItem as ChecklistItemTpl } from "@/lib/journey-checklists";

type NodeStatus = "pending" | "in_progress" | "complete";
type ModalStatus = "notstarted" | "inprog" | "blocked" | "complete";
type ChecklistOwner = "auto" | "client" | "agency";
interface ChecklistItem {
  /** Stable identity. New items always have one; legacy rows may not until next save. */
  key?: string;
  /** Legacy id from older template versions — kept for backward compatibility. */
  id?: string;
  label: string;
  owner: ChecklistOwner;
  done: boolean;
  auto_key?: string;
}


interface JourneyNode {
  id: string;
  client_id: string;
  key: string;
  label: string;
  order_index: number;
  status: NodeStatus;
  notes: string | null;
  asset_url: string | null;
  asset_label: string | null;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
  checklist: ChecklistItem[] | null;
}

interface Client {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  tier: string;
  intake_summary: string | null;
  brand_voice_url: string | null;
  brand_voice_content: string | null;
  brand_voice_doc: string | null;
  brand_voice_quick_ref: string | null;
  brand_voice_status: string;
  brand_voice_pdf_url: string | null;
  brand_voice_pdf_generated_at: string | null;
  brand_voice_generated_at: string | null;
  brand_voice_error: string | null;
  notes: string | null;
  purchased_at: string | null;
  created_at: string;
  archived: boolean;
  brand_kit_intake: Record<string, unknown> | null;
  brand_kit_intake_submitted_at: string | null;
}

// ---------- S-curve geometry ----------
function buildSCurve(w: number, h: number, count: number, intensity = 0.7) {
  const padX = 130;
  const padTop = 130;
  const padBot = 170;
  const innerW = Math.max(200, w - padX * 2);
  const innerH = Math.max(260, h - padTop - padBot);

  const spread = 0.5 * intensity;
  const bandY = [
    padTop + innerH * (0.5 - spread),
    padTop + innerH * 0.5,
    padTop + innerH * (0.5 + spread),
  ];

  const perBand = [
    Math.ceil(count / 3),
    Math.ceil((count - Math.ceil(count / 3)) / 2),
  ];
  perBand.push(count - perBand[0] - perBand[1]);

  const nodes: { x: number; y: number; index: number }[] = [];
  let idx = 0;
  for (let b = 0; b < 3; b++) {
    const n = perBand[b];
    const leftToRight = b % 2 === 0;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const x = leftToRight ? padX + t * innerW : padX + (1 - t) * innerW;
      nodes.push({ x, y: bandY[b], index: idx });
      idx++;
    }
  }

  if (nodes.length === 0) return { nodes, d: "" };

  let d = `M ${nodes[0].x} ${nodes[0].y}`;
  for (let i = 1; i < nodes.length; i++) {
    const p0 = nodes[i - 1];
    const p1 = nodes[i];
    const sameBand = Math.abs(p0.y - p1.y) < 2;
    if (sameBand) {
      const midX = (p0.x + p1.x) / 2;
      const bow = (p1.x - p0.x) * 0.02;
      d += ` C ${midX} ${p0.y + bow}, ${midX} ${p1.y + bow}, ${p1.x} ${p1.y}`;
    } else {
      const dx = p1.x - p0.x;
      const cx1 = p0.x + dx * 0.5;
      const cy1 = p0.y;
      const cx2 = p1.x - dx * 0.5;
      const cy2 = p1.y;
      d += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p1.x} ${p1.y}`;
    }
  }
  return { nodes, d };
}

function buildPartial(nodes: { x: number; y: number }[], k: number) {
  if (k < 0 || nodes.length === 0) return "";
  let d = `M ${nodes[0].x} ${nodes[0].y}`;
  for (let i = 1; i <= k; i++) {
    const p0 = nodes[i - 1];
    const p1 = nodes[i];
    const sameBand = Math.abs(p0.y - p1.y) < 2;
    if (sameBand) {
      const midX = (p0.x + p1.x) / 2;
      const bow = (p1.x - p0.x) * 0.02;
      d += ` C ${midX} ${p0.y + bow}, ${midX} ${p1.y + bow}, ${p1.x} ${p1.y}`;
    } else {
      const dx = p1.x - p0.x;
      const cx1 = p0.x + dx * 0.5;
      const cy1 = p0.y;
      const cx2 = p1.x - dx * 0.5;
      const cy2 = p1.y;
      d += ` C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p1.x} ${p1.y}`;
    }
  }
  return d;
}

// ---------- Page ----------
export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [nodes, setNodes] = useState<JourneyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNodeId, setOpenNodeId] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 700 });

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setSize({ w: Math.max(640, width), h: Math.max(420, height) });
      }
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ w: Math.max(640, r.width), h: Math.max(420, r.height) });
    return () => ro.disconnect();
  }, [loading]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [c, n] = await Promise.all([
      supabase.from("clients").select("*").eq("id", id).maybeSingle(),
      supabase.from("journey_nodes").select("*").eq("client_id", id).order("order_index"),
    ]);
    if (c.error) toast.error(c.error.message);
    const clientRow = (c.data as Client) || null;
    const rawNodes = ((n.data as unknown) as JourneyNode[]) || [];

    // Reshape each node's checklist against the latest template (preserves
    // `done` by stable key). If anything drifts, persist the corrected shape
    // back so it stops drifting on subsequent loads.
    const tier = clientRow?.tier ?? "launch";
    const reshaped = rawNodes.map((node) => {
      const tplId = templateIdFor(tier, node.key);
      if (!tplId) return node;
      const synced = syncChecklist(node.checklist, tplId) as ChecklistItemTpl[];
      const drifted =
        !Array.isArray(node.checklist) ||
        node.checklist.length !== synced.length ||
        node.checklist.some((it: any, i) => {
          const s = synced[i];
          return !it || it.key !== s.key || it.label !== s.label || it.owner !== s.owner;
        });
      if (drifted) {
        // Fire-and-forget; realtime sub will pick up the round-trip.
        supabase
          .from("journey_nodes")
          .update({ checklist: synced as never })
          .eq("id", node.id)
          .then(({ error }) => { if (error) console.warn("[checklist sync]", error.message); });
      }
      return { ...node, checklist: synced as ChecklistItem[] };
    });

    setClient(clientRow);
    setNodes(reshaped);
    setLoading(false);
  }, [id]);


  useEffect(() => { load(); }, [load]);

  // Realtime subscription
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`journey-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "journey_nodes", filter: `client_id=eq.${id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load]);

  const updateNode = async (nodeId: string, patch: Partial<JourneyNode>) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)));
    const { error } = await supabase
      .from("journey_nodes")
      .update(patch as never)
      .eq("id", nodeId);
    if (error) toast.error(error.message);
  };

  const { svgNodes, fullPath, progressPath, currentIdx, completedCount, total, pct } = useMemo(() => {
    const total = nodes.length;
    const { nodes: pts, d } = buildSCurve(size.w, size.h, total);
    const inProgIdx = nodes.findIndex((n) => n.status === "in_progress");
    const lastCompleteIdx = (() => {
      for (let i = nodes.length - 1; i >= 0; i--) {
        if (nodes[i].status === "complete") return i;
      }
      return -1;
    })();
    const allComplete = total > 0 && nodes.every((n) => n.status === "complete");
    const currentIdx = inProgIdx >= 0 ? inProgIdx : Math.min(total - 1, lastCompleteIdx + 1);
    const completedIdx = allComplete ? total - 1 : lastCompleteIdx;
    const progressPath = buildPartial(pts, completedIdx);
    const completedCount = allComplete ? total : Math.max(0, lastCompleteIdx + 1);
    const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;
    return { svgNodes: pts, fullPath: d, progressPath, currentIdx, completedCount, total, pct };
  }, [nodes, size]);

  const nodeSize = useMemo(() => {
    if (svgNodes.length < 2) return 18;
    let minD = Infinity;
    for (let i = 0; i < svgNodes.length; i++) {
      for (let j = i + 1; j < svgNodes.length; j++) {
        const dx = svgNodes[i].x - svgNodes[j].x;
        const dy = svgNodes[i].y - svgNodes[j].y;
        const dist = Math.hypot(dx, dy);
        if (dist < minD) minD = dist;
      }
    }
    const max = Math.min(22, (minD / 2) * 0.55);
    return Math.max(12, max);
  }, [svgNodes]);

  const stateFor = (i: number): "complete" | "current" | "blocked" | "upcoming" => {
    const n = nodes[i];
    if (!n) return "upcoming";
    if (n.status === "complete") return "complete";
    if (n.status === "in_progress") return "current";
    if (i === currentIdx) return "current";
    return "upcoming";
  };

  const ringC = 2 * Math.PI * 18;
  const ringOffset = ringC * (1 - pct / 100);

  const openNode = nodes.find((n) => n.id === openNodeId) || null;
  const openNodeIndex = openNode ? nodes.findIndex((n) => n.id === openNode.id) : -1;

  if (loading || !client) {
    return (
      <AdminLayout>
        <div className="px-12 py-16 text-[hsl(30_8%_62%)]">
          {loading ? "Loading…" : "Client not found."}
        </div>
      </AdminLayout>
    );
  }

  const daysSince = differenceInCalendarDays(
    new Date(),
    new Date(client.purchased_at || client.created_at),
  );

  return (
    <AdminLayout>
      <div className="detail">
        <div className="detail__bar">
          <button className="detail__back" onClick={() => navigate("/admin")}>Back</button>

          <div className="detail__client">
            <div className="detail__client-name">{client.business_name || "Untitled"}</div>
            <div className="detail__client-meta">
              <span className="tier">{client.tier === "growth" ? "Growth" : "Launch"} Tier</span>
              <span className="sep">·</span>
              <span>{daysSince}d since purchase</span>
              <span className="sep">·</span>
              <span>{client.contact_name || client.contact_email || "—"}</span>
            </div>
          </div>

          <div className="detail__bar-spacer" />

          <div className="detail__portal-actions">
            <a
              className="detail__portal-btn"
              href={`/portal/${client.id}?as=admin`}
              target="_blank"
              rel="noreferrer"
              title="Open this client's portal in a new tab as an admin preview (your admin session is unchanged)"
            >
              ◉ Open as client ↗
            </a>
            <button
              className="detail__portal-btn detail__portal-btn--ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${window.location.origin}/portal/${client.id}`);
                  toast.success("Portal link copied");
                } catch {
                  toast.error("Could not copy link");
                }
              }}
              title="Copy portal link"
            >
              ⧉ Copy
            </button>
            <button
              className="detail__portal-btn detail__portal-btn--ghost"
              onClick={async () => {
                const t = toast.loading("Syncing to SureContact…");
                try {
                  const { data, error } = await supabase.functions.invoke(
                    "sync-client-to-surecontact",
                    { body: { clientId: client.id } },
                  );
                  if (error) throw new Error(error.message);
                  if (!data?.success) throw new Error(data?.error || "Sync failed");
                  toast.success("Synced to SureContact", { id: t });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Sync failed", { id: t });
                }
              }}
              title="Push this client's portal link, tier, and current journey stage into SureContact"
            >
              ⇪ Sync to SureContact
            </button>
          </div>

          <div className="detail__bar-divider" aria-hidden="true" />

          <div className="detail__progress">
            <div className="detail__progress-text">
              <div className="detail__progress-eyebrow">Journey</div>
              <div className="detail__progress-fraction">
                {String(completedCount).padStart(2, "0")}
                <span className="slash">/</span>
                <span className="total">{String(total).padStart(2, "0")}</span>
              </div>
            </div>
            <svg className="detail__progress-ring" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" fill="none" stroke="hsl(40 20% 97% / 0.08)" strokeWidth="2" />
              <circle
                cx="22" cy="22" r="18" fill="none"
                stroke="hsl(30 25% 44%)" strokeWidth="2"
                strokeDasharray={ringC}
                strokeDashoffset={ringOffset}
                transform="rotate(-90 22 22)"
                strokeLinecap="round"
              />
              <text
                x="22" y="25" textAnchor="middle" fontSize="10"
                fill="hsl(40 20% 97%)"
                fontFamily="Cormorant Garamond, serif" fontStyle="italic"
              >
                {pct}%
              </text>
            </svg>
          </div>
        </div>

        <div className="canvas" ref={wrapRef}>
          <div className="canvas__grid" />
          <div className="canvas__ghost">Cre8</div>

          {total > 0 && (
            <svg className="canvas__svg" viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="xMidYMid meet">
              <path className="journey-path-bg" d={fullPath} />
              <path className="journey-path-drift" d={fullPath} />
              {progressPath && <path className="journey-path-progress" d={progressPath} />}

              {svgNodes.map((p, i) => {
                const node = nodes[i];
                const state = stateFor(i);
                const num = String(i + 1).padStart(2, "0");
                return (
                  <g
                    key={node.id}
                    className={`node node--${state}`}
                    transform={`translate(${p.x}, ${p.y}) rotate(45)`}
                    onClick={() => setOpenNodeId(node.id)}
                    role="button"
                    tabIndex={0}
                  >
                    {state === "current" && (
                      <rect
                        className="node__halo"
                        x={-nodeSize - 8} y={-nodeSize - 8}
                        width={(nodeSize + 8) * 2} height={(nodeSize + 8) * 2}
                      />
                    )}
                    <rect
                      className="node__frame"
                      x={-nodeSize} y={-nodeSize}
                      width={nodeSize * 2} height={nodeSize * 2}
                    />
                    <g transform="rotate(-45)">
                      <text className="node__num" y="1">{num}</text>
                    </g>
                    <g transform="rotate(-45)">
                      <text className="node__label" y={nodeSize + 26}>{node.label}</text>
                    </g>
                  </g>
                );
              })}
            </svg>
          )}

          <div className="canvas__legend">
            <span className="canvas__legend-item"><span className="canvas__legend-swatch canvas__legend-swatch--complete" /> Complete</span>
            <span className="canvas__legend-item"><span className="canvas__legend-swatch canvas__legend-swatch--current" /> In Progress</span>
            <span className="canvas__legend-item"><span className="canvas__legend-swatch" /> Upcoming</span>
          </div>
          <div className="canvas__hint">Click any deliverable to update its status and notes.</div>
        </div>

        <AdminContractSection clientId={client.id} />
      </div>

      {openNode && (
        <StageModal
          client={client}
          node={openNode}
          index={openNodeIndex}
          total={total}
          onClose={() => setOpenNodeId(null)}
          onUpdate={(patch) => updateNode(openNode.id, patch)}
          onReload={load}
        />
      )}
    </AdminLayout>
  );
}

// ---------- Stage modal ----------
function StageModal({
  client, node, index, total, onClose, onUpdate, onReload,
}: {
  client: Client;
  node: JourneyNode;
  index: number;
  total: number;
  onClose: () => void;
  onUpdate: (patch: Partial<JourneyNode>) => void;
  onReload: () => void;
}) {
  const [notes, setNotes] = useState(node.notes || "");
  const [assetLabel, setAssetLabel] = useState(node.asset_label || "");
  const [assetUrl, setAssetUrl] = useState(node.asset_url || "");

  useEffect(() => {
    setNotes(node.notes || "");
    setAssetLabel(node.asset_label || "");
    setAssetUrl(node.asset_url || "");
  }, [node.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dbToModalStatus = (s: NodeStatus): ModalStatus =>
    s === "complete" ? "complete" : s === "in_progress" ? "inprog" : "notstarted";
  const modalToDbStatus = (s: ModalStatus): NodeStatus =>
    s === "complete" ? "complete" : s === "inprog" || s === "blocked" ? "in_progress" : "pending";

  const status: ModalStatus = dbToModalStatus(node.status);

  const setStatus = (s: ModalStatus) => onUpdate({ status: modalToDbStatus(s) });

  const statusPill =
    status === "complete" ? { label: "Complete", cls: "crm-pill--complete" }
    : status === "inprog" ? { label: "In Progress", cls: "crm-pill--current" }
    : status === "blocked" ? { label: "Blocked", cls: "crm-pill--blocked" }
    : { label: "Not Started", cls: "" };

  // Title: split last word for italic accent
  const words = (node.label || "").split(" ");
  const titleHead = words.slice(0, -1).join(" ");
  const titleTail = words.slice(-1)[0] || "";

  const saveNotes = () => {
    if (notes !== (node.notes || "")) onUpdate({ notes: notes || null });
  };
  const saveAssetLabel = () => {
    if (assetLabel !== (node.asset_label || "")) onUpdate({ asset_label: assetLabel || null });
  };
  const saveAssetUrl = () => {
    if (assetUrl !== (node.asset_url || "")) onUpdate({ asset_url: assetUrl || null });
  };

  return (
    <div className="crm-shell">
      <div className="crm-modal-backdrop" onClick={onClose}>
        <div className="crm-modal" onClick={(e) => e.stopPropagation()}>
          <button className="crm-modal__close" onClick={onClose} aria-label="Close">✕</button>

          {/* LEFT */}
          <div className="crm-modal__left">
            <div className="crm-modal__stage-num">
              Stage <em>{String(index + 1).padStart(2, "0")}</em> &nbsp;·&nbsp; of {String(total).padStart(2, "0")}
            </div>
            <div className="crm-modal__eyebrow">
              {client.business_name || "Client"} — {client.tier === "growth" ? "Growth" : "Launch"} Journey
            </div>
            <h2 className="crm-modal__title">
              {titleHead && <>{titleHead} </>}
              <em>{titleTail}</em>.
            </h2>
            <hr className="crm-modal__rule" />
            <p className="crm-modal__desc">
              {status === "complete"
                ? "This deliverable is complete. Review the notes and any linked assets below."
                : status === "inprog"
                ? "Currently in progress. Track tasks and attach working files as you go."
                : "Not started yet. Use status, notes, and attachments to move it forward."}
            </p>

            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 32, flexWrap: "wrap" }}>
              <span className={`crm-pill ${statusPill.cls}`}>● {statusPill.label}</span>
            </div>

            <div className="crm-modal__meta">
              <div className="crm-modal__meta-item">
                <span className="lbl">Client</span>
                <div className="crm-modal__owner">
                  <span className="crm-owner-avatar">
                    {(client.business_name || "C").slice(0, 2).toUpperCase()}
                  </span>
                  <span className="val val--sm">{client.business_name || "—"}</span>
                </div>
              </div>
              <div className="crm-modal__meta-item">
                <span className="lbl">Tier</span>
                <span className="val">{client.tier === "growth" ? "Growth" : "Launch"}</span>
              </div>
              <div className="crm-modal__meta-item">
                <span className="lbl">Started</span>
                <span className="val">
                  {node.started_at ? format(new Date(node.started_at), "MMM d, yyyy") : "—"}
                </span>
              </div>
              <div className="crm-modal__meta-item">
                <span className="lbl">Completed</span>
                <span
                  className="val"
                  style={{ color: node.completed_at ? "hsl(40 20% 97%)" : "hsl(30 8% 62%)" }}
                >
                  {node.completed_at ? format(new Date(node.completed_at), "MMM d, yyyy") : "—"}
                </span>
              </div>
            </div>

            <div style={{ marginTop: "auto", paddingTop: 48, display: "flex", gap: 12 }}>
              <button className="crm-btn crm-btn--ghost" onClick={onClose}>← Back to Journey</button>
            </div>
          </div>

          {/* RIGHT */}
          <div className="crm-modal__right">
            <section>
              <div className="crm-modal__section-head">
                <div className="crm-modal__section-title">Status</div>
              </div>
              <div className="crm-status-seg">
                <button
                  className={`crm-status-seg__btn ${status === "notstarted" ? "crm-status-seg__btn--active" : ""}`}
                  onClick={() => setStatus("notstarted")}
                >Not Started</button>
                <button
                  className={`crm-status-seg__btn crm-status-seg__btn--inprog ${status === "inprog" ? "crm-status-seg__btn--active" : ""}`}
                  onClick={() => setStatus("inprog")}
                >In Progress</button>
                <button
                  className={`crm-status-seg__btn crm-status-seg__btn--blocked ${status === "blocked" ? "crm-status-seg__btn--active" : ""}`}
                  onClick={() => setStatus("blocked")}
                >Blocked</button>
                <button
                  className={`crm-status-seg__btn crm-status-seg__btn--complete ${status === "complete" ? "crm-status-seg__btn--active" : ""}`}
                  onClick={() => setStatus("complete")}
                >Complete</button>
              </div>
            </section>

            <NodeChecklist node={node} onUpdate={onUpdate} />

            {node.key === "brand_voice" && (
              <BrandVoicePanel client={client} onReload={onReload} />
            )}

            {node.key === "brand_kit" && (
              <BrandKitPanel client={client} />
            )}

            <section>
              <div className="crm-modal__section-head">
                <div className="crm-modal__section-title">Linked Asset</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input
                  className="crm-input"
                  placeholder="Asset label (e.g. Brand Voice doc)"
                  value={assetLabel}
                  onChange={(e) => setAssetLabel(e.target.value)}
                  onBlur={saveAssetLabel}
                />
                <input
                  className="crm-input"
                  placeholder="https://…"
                  value={assetUrl}
                  onChange={(e) => setAssetUrl(e.target.value)}
                  onBlur={saveAssetUrl}
                />
                {node.asset_url && (
                  <a
                    href={node.asset_url}
                    target="_blank"
                    rel="noreferrer"
                    className="crm-attach"
                  >
                    <span className="crm-attach__icon">URL</span>
                    <div className="crm-attach__info">
                      <span className="crm-attach__name">{node.asset_label || node.asset_url}</span>
                      <span className="crm-attach__meta">External link</span>
                    </div>
                    <span className="crm-attach__action">Open →</span>
                  </a>
                )}
              </div>
            </section>

            <section>
              <div className="crm-modal__section-head">
                <div className="crm-modal__section-title">Internal Notes</div>
              </div>
              <textarea
                className="crm-notes-area"
                placeholder="Notes only visible to the Cre8 team..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={saveNotes}
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Brand Voice panel (only shown for the brand_voice journey node) ----------
function BrandVoicePanel({
  client,
  onReload,
}: {
  client: Client;
  onReload: () => void;
}) {
  const [busy, setBusy] = useState<null | "regen" | "pdf">(null);
  const [showDoc, setShowDoc] = useState(false);

  const status = client.brand_voice_status || "pending";
  const hasDoc = !!client.brand_voice_doc;
  const hasPdf = !!client.brand_voice_pdf_url;

  const statusPill =
    status === "complete" ? { label: "Complete", cls: "crm-pill--complete" }
    : status === "in_progress" ? { label: "Generating…", cls: "crm-pill--current" }
    : status === "failed" ? { label: "Failed", cls: "crm-pill--blocked" }
    : { label: "Pending", cls: "" };

  const generatedAt = client.brand_voice_pdf_generated_at || client.brand_voice_generated_at;

  const callFn = async (mode: "regen" | "pdf") => {
    setBusy(mode);
    try {
      const { data, error } = await supabase.functions.invoke("generate-brand-voice", {
        body: { clientId: client.id, pdfOnly: mode === "pdf" },
      });
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || "Failed");
      toast.success(mode === "pdf" ? "PDF generated" : "Brand voice regenerated");
      onReload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const copyQrc = async () => {
    if (!client.brand_voice_quick_ref) {
      toast.error("No Quick Reference Card available");
      return;
    }
    try {
      await navigator.clipboard.writeText(client.brand_voice_quick_ref);
      toast.success("Quick Reference Card copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <section>
      <div className="crm-modal__section-head">
        <div className="crm-modal__section-title">Brand Voice Document</div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <span className={`crm-pill ${statusPill.cls}`}>● {statusPill.label}</span>
        {generatedAt && (
          <span style={{ fontSize: 11, color: "hsl(30 8% 62%)", letterSpacing: "0.04em" }}>
            Generated {format(new Date(generatedAt), "MMM d, yyyy · h:mm a")}
          </span>
        )}
      </div>

      {client.brand_voice_error && status === "failed" && (
        <div
          style={{
            fontSize: 11,
            color: "hsl(10 60% 70%)",
            background: "hsl(10 30% 20% / 0.4)",
            border: "1px solid hsl(10 30% 35% / 0.5)",
            padding: "10px 12px",
            borderRadius: 4,
            marginBottom: 14,
            fontFamily: "monospace",
          }}
        >
          {client.brand_voice_error}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        <button
          className="crm-btn crm-btn--ghost crm-btn--sm"
          onClick={copyQrc}
          disabled={!client.brand_voice_quick_ref}
        >
          Copy Quick Reference Card
        </button>
        <button
          className="crm-btn crm-btn--ghost crm-btn--sm"
          onClick={() => callFn("regen")}
          disabled={busy !== null}
        >
          {busy === "regen" ? "Regenerating…" : "Regenerate"}
        </button>
        {hasDoc && !hasPdf && (
          <button
            className="crm-btn crm-btn--bronze crm-btn--sm"
            onClick={() => callFn("pdf")}
            disabled={busy !== null}
          >
            {busy === "pdf" ? "Generating…" : "Generate PDF"}
          </button>
        )}
      </div>

      {hasDoc && (
        <>
          <button
            className="crm-btn crm-btn--ghost crm-btn--sm"
            onClick={() => setShowDoc((v) => !v)}
            style={{ marginBottom: 12 }}
          >
            {showDoc ? "Hide document" : "Preview document"}
          </button>
          {showDoc && (
            <div
              style={{
                background: "hsl(40 20% 97% / 0.04)",
                border: "1px solid hsl(40 20% 97% / 0.08)",
                borderRadius: 4,
                padding: "20px 24px",
                maxHeight: 360,
                overflowY: "auto",
                fontFamily: "var(--crm-font-serif), serif",
                fontSize: 13,
                lineHeight: 1.7,
                color: "hsl(40 20% 97%)",
                whiteSpace: "pre-wrap",
              }}
            >
              {client.brand_voice_doc}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ---------- Brand Kit panel (only shown for the brand_kit journey node) ----------
function BrandKitPanel({ client }: { client: Client }) {
  const intake = (client.brand_kit_intake || {}) as Record<string, unknown>;
  const submitted = !!client.brand_kit_intake_submitted_at;

  const portalUrl = `${window.location.origin}/portal/${client.id}`;

  const copyPortal = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      toast.success("Portal link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  return (
    <section>
      <div className="crm-modal__section-head">
        <div className="crm-modal__section-title">Brand Kit Intake</div>
        {submitted && (
          <span className="crm-pill crm-pill--complete" style={{ fontSize: 10 }}>
            ● Submitted {format(new Date(client.brand_kit_intake_submitted_at!), "MMM d")}
          </span>
        )}
      </div>


      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          padding: 12,
          border: "1px dashed hsl(30 12% 22%)",
          borderRadius: 6,
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontFamily: "var(--crm-font-sans), sans-serif",
            fontSize: 10,
            letterSpacing: "0.35em",
            textTransform: "uppercase",
            color: "hsl(30 8% 62%)",
          }}
        >
          Client Portal Link
        </span>
        <span
          style={{
            fontFamily: "var(--crm-font-sans), monospace",
            fontSize: 11,
            color: "hsl(40 20% 97%)",
            wordBreak: "break-all",
          }}
        >
          {portalUrl}
        </span>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button className="crm-btn crm-btn--ghost" onClick={copyPortal} style={{ fontSize: 11 }}>
            Copy link
          </button>
          <a
            className="crm-btn crm-btn--ghost"
            href={`${portalUrl}?as=admin`}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11, textDecoration: "none" }}
            title="Open as an admin preview (your admin session is unchanged)"
          >
            Open as client ↗
          </a>
        </div>
      </div>

      {submitted && intake && Object.keys(intake).length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary
            style={{
              fontFamily: "var(--crm-font-sans), sans-serif",
              fontSize: 10,
              letterSpacing: "0.35em",
              textTransform: "uppercase",
              color: "hsl(30 8% 62%)",
              cursor: "pointer",
              padding: "8px 0",
            }}
          >
            View raw intake
          </summary>
          <pre
            style={{
              marginTop: 8,
              padding: 12,
              background: "hsl(30 12% 10%)",
              border: "1px solid hsl(30 12% 22%)",
              borderRadius: 6,
              maxHeight: 280,
              overflow: "auto",
              fontSize: 11,
              lineHeight: 1.5,
              color: "hsl(40 20% 92%)",
              whiteSpace: "pre-wrap",
            }}
          >
            {JSON.stringify(intake, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}

// ---------- Node Checklist (3-section, ownership-coded) ----------
function NodeChecklist({
  node,
  onUpdate,
}: {
  node: JourneyNode;
  onUpdate: (patch: Partial<JourneyNode>) => void;
}) {
  const items: ChecklistItem[] = Array.isArray(node.checklist) ? node.checklist : [];

  if (items.length === 0) {
    return (
      <section>
        <div className="crm-modal__section-head">
          <div className="crm-modal__section-title">Checklist</div>
        </div>
        <div style={{ fontSize: 12, color: "hsl(30 8% 62%)", fontStyle: "italic", fontFamily: "var(--crm-font-serif), serif" }}>
          No checklist items defined for this stage yet.
        </div>
      </section>
    );
  }

  const toggle = (id: string) => {
    const next = items.map((it) => (it.id === id ? { ...it, done: !it.done } : it));
    onUpdate({ checklist: next });
  };

  const groups: { owner: ChecklistOwner; label: string; icon: string }[] = [
    { owner: "auto",   label: "Auto",   icon: "🤖" },
    { owner: "client", label: "Client", icon: "👤" },
    { owner: "agency", label: "Agency", icon: "✦" },
  ];

  const doneCount = items.filter((i) => i.done).length;

  return (
    <section>
      <div className="crm-modal__section-head">
        <div className="crm-modal__section-title">Checklist</div>
        <span className="crm-checklist-group__count">
          {doneCount} of {items.length} complete
        </span>
      </div>

      {groups.map((g) => {
        const groupItems = items.filter((i) => i.owner === g.owner);
        if (groupItems.length === 0) return null;
        const groupDone = groupItems.filter((i) => i.done).length;
        return (
          <div key={g.owner} className="crm-checklist-group">
            <div className="crm-checklist-group__head">
              <span><span className="icon">{g.icon}</span>{g.label}</span>
              <span className="crm-checklist-group__count">{groupDone}/{groupItems.length}</span>
            </div>
            <div className="crm-checklist">
              {groupItems.map((it) => {
                const readonly = it.owner === "auto";
                return (
                  <div
                    key={it.id}
                    className={[
                      "crm-checkitem",
                      `crm-checkitem--${it.owner}`,
                      it.done ? "crm-checkitem--done" : "",
                      readonly ? "crm-checkitem--readonly" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => { if (!readonly) toggle(it.id); }}
                    role={readonly ? undefined : "button"}
                    tabIndex={readonly ? -1 : 0}
                    onKeyDown={(e) => {
                      if (readonly) return;
                      if (e.key === " " || e.key === "Enter") {
                        e.preventDefault();
                        toggle(it.id);
                      }
                    }}
                  >
                    <span className="crm-checkitem__box" aria-hidden />
                    <span className="crm-checkitem__label">{it.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

