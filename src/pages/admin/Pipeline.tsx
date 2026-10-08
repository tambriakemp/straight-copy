// Pipeline — CRE-332 Phase 6. Reads live from SureContact's "Cre8 Prospect"
// pipeline (via the pipeline-board edge function) and buckets every deal
// into the columns Bree approved Oct 7, 2026: Lead, Intake (Demo Scheduled
// folded in), Proposal sent (In Negotiation folded in, flagged Revised),
// Signed, Won. Lost is hidden by default, behind a "Show lost" toggle.
// Column labels match SureContact's own stage names exactly (Bree's Oct 7
// 11:41 PM CT correction — SureContact doesn't allow deleting its Won
// stage, so the admin side must not drift from it, e.g. "Deposit paid").
//
// Two-way sync (CRE-332 Phase 6.2, approved Oct 8, 2026): dragging a card
// moves the real SureContact deal via pipeline-deal-move — SureContact
// stays the source of truth, there's nothing here to keep in sync, since
// pipeline-board reads live on every load. Won cards aren't draggable
// (SureContact has no "un-win" endpoint); Lost cards get a Reopen action
// instead of a drag, since reopening is the only backward move the API
// allows, and always lands on Proposal sent — drag it further from there
// if that's not where it belongs.
import { useEffect, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw, Workflow } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import PageHeader from "@/components/admin/cv/PageHeader";
import Card from "@/components/admin/cv/Card";
import EmptyState from "@/components/admin/cv/EmptyState";
import StatusChip from "@/components/admin/cv/StatusChip";
import { formatMoney } from "@/lib/adminOperations";
import { loadPipelineBoard, moveDealOnBoard, type BoardColumnKey, type PipelineBoard, type PipelineCard } from "@/lib/pipelineBoard";

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Pipeline() {
  const navigate = useNavigate();
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"board" | "list">("board");
  const [showLost, setShowLost] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<BoardColumnKey | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    loadPipelineBoard()
      .then(setBoard)
      .catch((e: Error) => setError(e.message || "Could not load the pipeline"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const syncNow = () => { load(); toast("Syncing with SureContact…"); };

  const openDeal = (card: PipelineCard) => {
    if (card.clientId) navigate(`/admin/clients/${card.clientId}`);
    else toast("This deal isn't linked to a client record on the site yet.");
  };

  const moveCard = async (dealUuid: string, toColumn: BoardColumnKey, opts?: { reopen?: boolean; lossReason?: string }) => {
    setMoving(dealUuid);
    try {
      await moveDealOnBoard({ dealUuid, toColumn, ...opts });
      toast.success(`Moved to ${toColumn === "won" ? "Won" : toColumn === "lost" ? "Lost" : "the next stage"} in SureContact`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not move the deal in SureContact");
    } finally {
      setMoving(null);
    }
  };

  const handleDrop = (toColumn: BoardColumnKey) => (e: DragEvent) => {
    e.preventDefault();
    setDragOverCol(null);
    const dealUuid = e.dataTransfer.getData("text/plain");
    if (!dealUuid) return;
    if (toColumn === "lost") {
      const reason = window.prompt("Why is this deal lost? (shown in SureContact)");
      if (reason === null) return; // cancelled
      moveCard(dealUuid, toColumn, { lossReason: reason });
      return;
    }
    moveCard(dealUuid, toColumn);
  };

  const reopenCard = (card: PipelineCard) => {
    moveCard(card.dealUuid, "proposalSent", { reopen: true });
  };

  const allVisibleCards: PipelineCard[] = board
    ? [...board.columns.flatMap((c) => c.deals), ...(showLost ? board.lost.deals : [])]
    : [];

  return (
    <AdminLayout>
      <div className="cv-admin" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <PageHeader
          eyebrow="Daily / Pipeline"
          title="Pipeline"
          subtitle="Leads and clients by stage, read live from SureContact's Cre8 Prospect pipeline."
          right={
            <div className="cv-sync-row">
              {board && <span className="cv-chip cv-chip--gray">Synced {timeAgo(board.syncedAt)}</span>}
              {board && board.unmatchedCount > 0 && (
                <span className="cv-chip cv-chip--amber">
                  {board.unmatchedCount} deal{board.unmatchedCount === 1 ? "" : "s"} unmatched to a stage
                </span>
              )}
              <button type="button" className="cv-sync-btn" onClick={syncNow} disabled={loading}>
                <RefreshCw size={13} className={loading ? "cv-spin" : undefined} /> Sync now
              </button>
            </div>
          }
        />

        <div className="cv-tabs" style={{ padding: "0 32px", marginBottom: 20 }}>
          <button type="button" className={`cv-tab ${view === "board" ? "cv-tab--active" : ""}`} onClick={() => setView("board")}>Board</button>
          <button type="button" className={`cv-tab ${view === "list" ? "cv-tab--active" : ""}`} onClick={() => setView("list")}>List</button>
        </div>

        <div style={{ padding: "0 32px 32px" }}>
          {error ? (
            <Card className="cv-card-pad">
              <EmptyState
                icon={Workflow}
                title="Couldn't load the pipeline"
                subtitle={error}
                action={<button type="button" className="cv-sync-btn" onClick={load}>Try again</button>}
              />
            </Card>
          ) : !board ? (
            <div style={{ fontSize: 14, color: "var(--cv-muted)" }}>Loading…</div>
          ) : view === "board" ? (
            <>
              <div className="cv-pipeline-strip">
                {board.columns.map((col) => (
                  <div key={col.key} className="cv-pipeline-strip__item">
                    <div className="cv-pipeline-strip__label">{col.label}</div>
                    <div className="cv-pipeline-strip__count">{col.count}</div>
                    <div className="cv-pipeline-strip__value">{formatMoney(col.totalCents)}</div>
                  </div>
                ))}
                {board.lost.count > 0 && (
                  <button type="button" className="cv-pipeline-strip__item cv-pipeline-strip__item--muted" onClick={() => setShowLost((v) => !v)}>
                    <div className="cv-pipeline-strip__label">{showLost ? "Hide lost" : "Show lost"}</div>
                    <div className="cv-pipeline-strip__count">{board.lost.count}</div>
                    <div className="cv-pipeline-strip__value">{formatMoney(board.lost.totalCents)}</div>
                  </button>
                )}
              </div>

              <div className="cv-kanban">
                {board.columns.map((col) => (
                  <div
                    key={col.key}
                    className={`cv-kanban__col${dragOverCol === col.key ? " cv-kanban__col--drop-target" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
                    onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
                    onDrop={handleDrop(col.key)}
                  >
                    <div className="cv-kanban__col-head">
                      <span>{col.label}</span>
                      <span className="cv-kanban__col-count">{col.count}</span>
                    </div>
                    {col.deals.length === 0 ? (
                      <div className="cv-kanban__empty">No deals</div>
                    ) : (
                      col.deals.map((card) => (
                        <PipelineDealCard
                          key={card.dealUuid}
                          card={card}
                          onClick={() => openDeal(card)}
                          draggable={card.column !== "won"}
                          busy={moving === card.dealUuid}
                        />
                      ))
                    )}
                  </div>
                ))}
                {showLost && (
                  <div className="cv-kanban__col">
                    <div className="cv-kanban__col-head">
                      <span>Lost</span>
                      <span className="cv-kanban__col-count">{board.lost.count}</span>
                    </div>
                    {board.lost.deals.map((card) => (
                      <PipelineDealCard
                        key={card.dealUuid}
                        card={card}
                        onClick={() => openDeal(card)}
                        draggable={false}
                        busy={moving === card.dealUuid}
                        onReopen={() => reopenCard(card)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <Card className="cv-card-pad">
              {allVisibleCards.length === 0 ? (
                <EmptyState title="No deals" subtitle="Nothing in the Cre8 Prospect pipeline yet." />
              ) : (
                <div className="cv-simple-list">
                  {allVisibleCards.map((card) => (
                    <button
                      key={card.dealUuid}
                      type="button"
                      className="cv-simple-list__row"
                      style={{ width: "100%", background: "none", border: "none", borderBottom: "1px solid var(--cv-border)", cursor: "pointer", textAlign: "left" }}
                      onClick={() => openDeal(card)}
                    >
                      <span className="cv-simple-list__main">
                        <span className="cv-simple-list__title">{card.company}{card.revised ? " · Revised" : ""}</span>
                        <span className="cv-simple-list__sub">
                          {card.name}
                          {card.amountCents != null ? ` · ${formatMoney(card.amountCents)}` : ""}
                          {card.daysInStage != null ? ` · ${card.daysInStage}d in stage` : ""}
                        </span>
                      </span>
                      <StatusChip label={card.column === "won" ? "Won" : card.column === "lost" ? "Lost" : card.stageName} tone={card.column === "won" ? "green" : card.column === "lost" ? "red" : "bronze"} />
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function PipelineDealCard({
  card, onClick, draggable = false, busy = false, onReopen,
}: {
  card: PipelineCard;
  onClick: () => void;
  draggable?: boolean;
  busy?: boolean;
  onReopen?: () => void;
}) {
  return (
    // A plain div, not a button — the Reopen action below is a real nested
    // <button>, which HTML doesn't allow inside another <button>.
    <div
      role="button"
      tabIndex={0}
      className="cv-kanban-card"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      draggable={draggable && !busy}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", card.dealUuid); e.dataTransfer.effectAllowed = "move"; }}
      style={{ opacity: busy ? 0.5 : 1, cursor: busy ? "wait" : draggable ? "grab" : "pointer" }}
    >
      <div className="cv-kanban-card__company">{card.company}</div>
      <div className="cv-kanban-card__service">{card.name}</div>
      <div className="cv-kanban-card__meta">
        <span className="cv-kanban-card__value">{card.amountCents != null ? formatMoney(card.amountCents) : "—"}</span>
        {card.daysInStage != null && <span className="cv-kanban-card__days">{card.daysInStage}d</span>}
      </div>
      {card.revised && <span className="cv-chip cv-chip--amber" style={{ marginTop: 6 }}>Revised</span>}
      {onReopen && (
        <button
          type="button"
          className="cv-sync-btn"
          style={{ marginTop: 8 }}
          onClick={(e) => { e.stopPropagation(); onReopen(); }}
        >
          Reopen
        </button>
      )}
    </div>
  );
}
