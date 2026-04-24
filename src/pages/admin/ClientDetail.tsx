import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { toast } from "sonner";
import { differenceInCalendarDays, format } from "date-fns";

type NodeStatus = "pending" | "in_progress" | "complete";
type ModalStatus = "notstarted" | "inprog" | "blocked" | "complete";

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
    setClient((c.data as Client) || null);
    setNodes((n.data as JourneyNode[]) || []);
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
        <div className="detail__pill">
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
        </div>

        <div className="detail__progress">
          <div>
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

        <div className="canvas" ref={wrapRef}>
          <div className="canvas__grid" />
          <div className="canvas__ghost">Cre8</div>

          {total > 0 && (
            <svg className="canvas__svg" viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none">
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
