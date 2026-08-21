// The actions an agent proposed, and the buttons that settle them.
//
// This is the same block the run page shows, extracted so the chat can show it
// too. A run posted into chat that reads "1 action — review →" makes you leave
// the conversation to do the one thing the conversation was for; the decision
// belongs where the agent asked for it.
import { useState } from "react";
import { toast } from "sonner";
import { agentsApi, errMsg, ACTION_LABEL, type AgentAction } from "@/lib/agentsApi";
import { collapseProposalWrites } from "./collapseProposalWrites";
import AgentDeliverable from "@/components/admin/agent/AgentDeliverable";
import { deliverableOf } from "@/components/admin/agent/deliverable";

const STATUS_TONE: Record<string, string> = {
  executed: "#9db8a6", rejected: "var(--crm-taupe)", failed: "#e07a5f",
  proposed: "#dbb172", approved: "#dbb172",
};

const STATUS_LABEL: Record<string, string> = {
  executed: "Done", rejected: "Declined", failed: "Failed",
  proposed: "Awaiting you", approved: "Approved",
};

/** Deleting is the one thing worth naming plainly before it happens. */
function DeletePreview({ payload }: { payload: Record<string, unknown> }) {
  const table = String(payload.table ?? "");
  const label = String(payload.label ?? "");
  return (
    <div className="ws__act-preview">
      <div className="ws__act-warn">This permanently removes the record.</div>
      <div>
        {label || "Record"}
        {table && <span className="ws__act-dim"> · {table.replace(/_/g, " ")}</span>}
      </div>
      {!!payload.id && <div className="ws__act-dim">{String(payload.id)}</div>}
    </div>
  );
}

function EmailPreview({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="ws__act-preview">
      <div className="ws__act-dim">To: {String(payload.to ?? "—")}</div>
      <div className="ws__act-dim" style={{ marginBottom: 8 }}>
        Subject: {String(payload.subject ?? "—")}
      </div>
      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
        {String(payload.body ?? "")}
      </div>
    </div>
  );
}

export default function AgentActionCards({ actions, onSettled }: {
  actions: AgentAction[];
  /** Called after anything is approved or declined, so the caller can reload. */
  onSettled: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const pending = actions.filter((a) => a.status === "proposed" || a.status === "approved");
  const settled = actions.filter((a) => !pending.includes(a));

  const decide = async (action: AgentAction, verb: "approve" | "reject") => {
    setBusy(action.id);
    try {
      await agentsApi(`/actions/${action.id}/${verb}`, { method: "POST" });
      toast.success(verb === "approve" ? "Done" : "Declined");
    } catch (e) {
      toast.error(errMsg(e) || "Could not update");
    } finally {
      setBusy(null);
      onSettled();
    }
  };

  if (!actions.length) return null;


  return (
    <div className="ws__acts">
      {pending.map((a) => {
        const destructive = a.kind === "delete_record";
        return (
          <div key={a.id} className={`ws__act${destructive ? " ws__act--danger" : ""}`}>
            <div className="ws__act-kind">
              {ACTION_LABEL[a.kind] ?? a.kind.replace(/_/g, " ")}
              {a.outward && <span className="ws__act-flag"> · reaches a person</span>}
              {destructive && <span className="ws__act-flag"> · cannot be undone</span>}
            </div>
            <div className="ws__act-title">{a.title}</div>
            {a.description && <p className="ws__act-desc">{a.description}</p>}

            {a.kind === "draft_email" && <EmailPreview payload={a.payload} />}
            {a.kind === "send_proposal" && <EmailPreview payload={a.payload} />}
            {destructive && <DeletePreview payload={a.payload} />}

            <div className="ws__act-buttons">
              <button className="crm-btn crm-btn--bronze" style={{ fontSize: 14 }}
                disabled={busy === a.id} onClick={() => void decide(a, "approve")}>
                {busy === a.id
                  ? "Working…"
                  : destructive
                    ? "Yes, delete it"
                    : a.outward
                      ? "Approve & send"
                      : "Approve"}
              </button>
              <button className="crm-btn crm-btn--ghost" style={{ fontSize: 14 }}
                disabled={busy === a.id} onClick={() => void decide(a, "reject")}>
                {destructive ? "Keep it" : "Decline"}
              </button>
            </div>
          </div>
        );
      })}

      {collapseProposalWrites(settled).map((a) => (
        deliverableOf(a)
          // Something was actually produced — show the thing, not a log line.
          ? <AgentDeliverable key={a.id} action={a} />
          : <div key={a.id} className="ws__act-done">
          <span style={{ color: STATUS_TONE[a.status] }}>●</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block" }}>{a.title}</span>
            <span className="ws__act-dim" style={{ display: "block", marginTop: 2 }}>
              {ACTION_LABEL[a.kind] ?? a.kind.replace(/_/g, " ")}
              {a.error && <span style={{ color: "#e07a5f" }}> · {a.error}</span>}
            </span>
          </span>
          <span style={{ color: STATUS_TONE[a.status], fontSize: 13 }}>
            {STATUS_LABEL[a.status] ?? a.status}
          </span>
          </div>
      ))}
    </div>
  );
}
