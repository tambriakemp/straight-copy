// Pipeline — CRE-332 Phase 6, relaid out to the Admin Journeys canvas.
//
// Reads live from SureContact's "Cre8 Prospect" pipeline (via the
// pipeline-board edge function) and buckets every deal into the columns
// Bree approved Oct 7, 2026: Lead, Intake (Demo Scheduled folded in),
// Proposal sent (In Negotiation folded in, flagged Revised), Signed, Won.
// Column labels match SureContact's own stage names exactly — SureContact
// doesn't allow deleting its Won stage, so the admin side must not drift
// from it.
//
// Two-way sync (Phase 6.2): dragging a card moves the real SureContact
// deal via pipeline-deal-move. SureContact stays the source of truth and
// there is nothing here to keep in sync, since pipeline-board reads live
// on every load. Won cards aren't draggable (there is no "un-win"
// endpoint); Lost cards get Reopen instead, which always lands on Proposal
// sent — drag it on from there if that is not where it belongs.
//
// What the canvas changed: Lost came off the board. It was a column you
// toggled on, which put dead deals in the same left-to-right reading order
// as live ones; it is a list at the foot of the page now, which is where
// you look when you are looking for it and nowhere otherwise.
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw, Plus, Workflow } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import Card from "@/components/admin/cv/Card";
import EmptyState from "@/components/admin/cv/EmptyState";
import { supabase } from "@/integrations/supabase/client";
// usd, not formatMoney: the canvas writes "$5,000", and "$5,000.00"
// reads as a line on a statement rather than a figure.
import { usd } from "@/lib/clientBalance";
import { stageTile, daysLabel, isStale, emptyCopy } from "@/lib/pipelineStrip";
import { stageTone } from "@/lib/pipelineTone";
import {
  loadPipelineBoard, moveDealOnBoard,
  type BoardColumnKey, type PipelineBoard, type PipelineCard,
} from "@/lib/pipelineBoard";

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function DealCard({
  card, person, onClick, draggable, busy,
}: {
  card: PipelineCard;
  person: string | null;
  onClick: () => void;
  draggable: boolean;
  busy: boolean;
}) {
  const days = daysLabel(card.daysInStage);
  const stale = isStale(card.daysInStage);
  return (
    // A div rather than a button: Lost cards carry a real nested <button>,
    // which HTML does not allow inside another one.
    <div
      role="button"
      tabIndex={0}
      className="cv-deal"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      draggable={draggable && !busy}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", card.dealUuid); e.dataTransfer.effectAllowed = "move"; }}
      style={{ opacity: busy ? 0.5 : 1, cursor: busy ? "wait" : draggable ? "grab" : "pointer" }}
    >
      <div className="cv-deal__top">
        <strong>{card.company}</strong>
        <span className={`cv-chip cv-chip--${stageTone(card.stageName)}`}>
          {card.revised ? "Revised" : card.stageName}
        </span>
      </div>
      {person && <p>{person}</p>}
      {card.name && card.name !== card.company && <p>{card.name}</p>}
      <div className="cv-deal__meta">
        {card.amountCents != null && card.amountCents > 0
          ? <span className="cv-deal__amount">{usd(card.amountCents)}</span>
          : <span>No amount set</span>}
        {days && (stale
          ? <span className="cv-chip cv-chip--red">{days}</span>
          : <span>{days}</span>)}
      </div>
    </div>
  );
}

export default function Pipeline() {
  const navigate = useNavigate();
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [people, setPeople] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<BoardColumnKey | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    loadPipelineBoard()
      .then(async (b) => {
        setBoard(b);
        // The canvas prints the person under the company on every card.
        // pipeline-board already joins to `clients` to work out the
        // company but only returns that, so the names are fetched here
        // rather than changed there — an edge-function change costs a
        // Lovable deploy, and one column does not.
        const ids = [...new Set(
          [...b.columns.flatMap((c) => c.deals), ...b.lost.deals]
            .map((d) => d.clientId).filter((x): x is string => !!x),
        )];
        if (!ids.length) { setPeople(new Map()); return; }
        const { data } = await supabase.from("clients").select("id, contact_name").in("id", ids);
        setPeople(new Map((data ?? [])
          .filter((r) => r.contact_name)
          .map((r) => [r.id as string, r.contact_name as string])));
      })
      .catch((e: Error) => setError(e.message || "Could not load the pipeline"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const personFor = (card: PipelineCard) => (card.clientId ? people.get(card.clientId) ?? null : null);

  const openDeal = (card: PipelineCard) => {
    if (card.clientProjectId && card.clientId) navigate(`/admin/clients/${card.clientId}/projects/${card.clientProjectId}`);
    else if (card.clientId) navigate(`/admin/clients/${card.clientId}`);
    else toast("This deal isn't linked to a client record on the site yet.");
  };

  const moveCard = async (dealUuid: string, toColumn: BoardColumnKey, opts?: { reopen?: boolean; lossReason?: string }) => {
    setMoving(dealUuid);
    try {
      await moveDealOnBoard({ dealUuid, toColumn, ...opts });
      toast.success("Moved in SureContact");
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

  const tiles = useMemo(() => {
    if (!board) return [];
    return [
      ...board.columns.map(stageTile),
      stageTile({ key: "lost", label: "Lost", count: board.lost.count, totalCents: board.lost.totalCents }),
    ];
  }, [board]);

  return (
    <AdminLayout topBar={false}>
      <div className="cv-admin cv-page" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            <h1 className="cv-page-title">Pipeline</h1>
            <p className="cv-page-sub">
              Every deal from first contact to paid. Deals live in SureContact;
              moving a card here moves it there.
            </p>
          </div>
          {board && <span style={{ fontSize: 13, color: "var(--cv-muted)" }}>Synced {timeAgo(board.syncedAt)}</span>}
          {board && board.unmatchedCount > 0 && (
            <span className="cv-chip cv-chip--amber">
              {board.unmatchedCount} unmatched to a stage
            </span>
          )}
          <button type="button" className="cv-open" style={{ padding: "0 20px" }} onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? "cv-spin" : undefined} style={{ marginRight: 7 }} />
            Sync now
          </button>
          <button
            type="button"
            className="cv-open cv-open--dark"
            style={{ padding: "0 20px" }}
            disabled
            title="Deals are created in SureContact — there is no create endpoint on the pipeline API yet."
          >
            <Plus size={15} style={{ marginRight: 7 }} /> New deal
          </button>
        </div>

        {error ? (
          <Card className="cv-card-pad">
            <EmptyState
              icon={Workflow}
              title="Couldn't load the pipeline"
              subtitle={error}
              action={<button type="button" className="cv-open" style={{ padding: "0 20px" }} onClick={load}>Try again</button>}
            />
          </Card>
        ) : !board ? (
          <p className="cv-page-sub">Loading…</p>
        ) : (
          <>
            <div className="cv-stgrow">
              {tiles.map((t) => (
                <div key={t.label} className={`cv-stg ${t.dark ? "cv-stg--dark" : ""}`}>
                  <span>{t.label}</span>
                  <b>{t.value}</b>
                  <small>{t.caption}</small>
                </div>
              ))}
            </div>

            <div className="cv-board">
              {board.columns.map((col) => (
                <div
                  key={col.key}
                  className={`cv-col ${dragOverCol === col.key ? "cv-col--drop" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
                  onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
                  onDrop={handleDrop(col.key)}
                >
                  <h2>{col.label} <span>{col.count}</span></h2>
                  {col.deals.length === 0 ? (
                    <div className="cv-colempty">{emptyCopy(col.key)}</div>
                  ) : col.deals.map((card) => (
                    <DealCard
                      key={card.dealUuid}
                      card={card}
                      person={personFor(card)}
                      onClick={() => openDeal(card)}
                      // No un-win endpoint, so a Won card cannot be
                      // dragged back out of Won.
                      draggable={card.column !== "won"}
                      busy={moving === card.dealUuid}
                    />
                  ))}
                </div>
              ))}
            </div>

            {board.lost.count > 0 && (
              <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2 className="cv-card-title">Lost</h2>
                  <span className="cv-chip cv-chip--gray">{board.lost.count}</span>
                </div>
                {board.lost.deals.map((card) => {
                  const person = personFor(card);
                  return (
                    <div
                      key={card.dealUuid}
                      style={{
                        display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12,
                        padding: "12px 0", borderTop: "1px solid var(--cv-border)", fontSize: 14,
                        opacity: moving === card.dealUuid ? 0.5 : 1,
                      }}
                    >
                      <span style={{ flex: "1 1 260px", minWidth: 0 }}>
                        <strong style={{ fontWeight: 600 }}>{card.company}</strong>
                        {person ? ` · ${person}` : ""}
                        <br />
                        <span style={{ fontSize: 13, color: "var(--cv-muted)" }}>
                          {card.name}
                          {card.amountCents != null && card.amountCents > 0 ? ` · ${usd(card.amountCents)}` : ""}
                        </span>
                      </span>
                      <span className="cv-chip cv-chip--red">{card.stageName}</span>
                      <button
                        type="button"
                        className="cv-mini"
                        disabled={moving === card.dealUuid}
                        // Reopen always lands on Proposal sent: it is the
                        // only backward move the SureContact API allows.
                        onClick={() => moveCard(card.dealUuid, "proposalSent", { reopen: true })}
                      >
                        Reopen
                      </button>
                    </div>
                  );
                })}
              </section>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
