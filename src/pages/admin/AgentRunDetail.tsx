// One agent run — the brief it wrote, and the actions waiting on your call.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import AdminLayout from "@/components/admin/AdminLayout";
import { Empty, Section, relTime } from "@/components/admin/DashboardPrimitives";
import { agentsApi, errMsg, ACTION_LABEL, type AgentAction, type AgentRun } from "@/lib/agentsApi";

type Payload = {
  run: AgentRun;
  agent: { id: string; key: string; name: string; role: string; autonomy: string } | null;
  actions: AgentAction[];
};

const STATUS_TONE: Record<string, string> = {
  executed: "#9db8a6", rejected: "var(--crm-taupe)", failed: "#e07a5f",
  proposed: "#dbb172", approved: "#dbb172",
};

const STATUS_LABEL: Record<string, string> = {
  executed: "Done", rejected: "Declined", failed: "Failed",
  proposed: "Awaiting you", approved: "Approved",
};

export default function AgentRunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    if (!runId) return;
    setLoading(true);
    try {
      setData(await agentsApi<Payload>(`/runs/${runId}`));
    } catch (e) {
      toast.error(errMsg(e) || "Failed to load run");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [runId]);

  const decide = async (action: AgentAction, verb: "approve" | "reject") => {
    setBusy(action.id);
    try {
      await agentsApi(`/actions/${action.id}/${verb}`, { method: "POST" });
      toast.success(verb === "approve" ? "Done" : "Declined");
      load();
    } catch (e) {
      toast.error(errMsg(e) || "Could not update");
      load();
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <AdminLayout><div className="roster"><p className="text-[hsl(30_8%_62%)] text-sm">Loading…</p></div></AdminLayout>;
  }
  if (!data) {
    return <AdminLayout><div className="roster"><Empty>Run not found.</Empty></div></AdminLayout>;
  }

  const { run, agent, actions } = data;
  const pending = actions.filter((a) => a.status === "proposed");
  const settled = actions.filter((a) => a.status !== "proposed");

  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__ghost">RUN</div>

        <div className="roster__head">
          <div className="roster__title-block">
            <button onClick={() => navigate(agent ? `/admin/agents/${agent.id}` : "/admin")}
              className="crm-btn crm-btn--ghost" style={{ fontSize: 11, marginBottom: 10 }}>
              ← {agent?.name ?? "Agents"}
            </button>
            <div className="roster__eyebrow">
              {agent?.role} · {run.trigger} run · {relTime(run.started_at)}
            </div>
            <h1 className="roster__title" style={{ fontSize: "clamp(22px, 2.2vw, 28px)" }}>
              {run.headline ?? (run.status === "failed" ? "Run failed" : "Run")}
            </h1>
            <hr className="roster__rule" />
          </div>
        </div>

        {run.status === "failed" && (
          <div style={{ padding: "14px 16px", background: "var(--crm-charcoal)",
            border: "1px solid #e07a5f", color: "#e07a5f", fontSize: 13, marginBottom: 24 }}>
            {run.error ?? "The run failed with no error recorded."}
          </div>
        )}

        <div style={{ display: "grid", gap: 24 }}>
          {run.summary && (
            <Section title="The brief">
              <div className="prose prose-invert prose-sm"
                style={{ padding: 18, background: "var(--crm-charcoal)", color: "var(--crm-warm-white)",
                  fontSize: 14, lineHeight: 1.7, maxWidth: "none" }}>
                <ReactMarkdown>{run.summary}</ReactMarkdown>
              </div>
            </Section>
          )}

          {!!pending.length && (
            <Section title={`Waiting for you — ${pending.length}`}>
              {pending.map((a) => (
                <div key={a.id} style={{ padding: "14px 16px", background: "var(--crm-charcoal)",
                  borderBottom: "1px solid var(--crm-border-dark)", color: "var(--crm-warm-white)" }}>
                  <div style={{ fontSize: 10, letterSpacing: "0.25em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>
                    {ACTION_LABEL[a.kind] ?? a.kind}
                    {a.outward && <span style={{ color: "#dbb172" }}> · reaches a person</span>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginTop: 5 }}>{a.title}</div>
                  {a.description && (
                    <p style={{ fontSize: 13, color: "var(--crm-taupe)", margin: "6px 0 0" }}>{a.description}</p>
                  )}

                  {/* Show a draft in full — approving it sends it. */}
                  {a.kind === "draft_email" && (
                    <div style={{ marginTop: 10, padding: 12, background: "var(--crm-ink)",
                      border: "1px solid var(--crm-border-dark)", fontSize: 12 }}>
                      <div style={{ color: "var(--crm-taupe)" }}>
                        To: {String(a.payload.to ?? "—")}
                      </div>
                      <div style={{ color: "var(--crm-taupe)", marginBottom: 8 }}>
                        Subject: {String(a.payload.subject ?? "—")}
                      </div>
                      <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                        {String(a.payload.body ?? "")}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="crm-btn crm-btn--bronze" style={{ fontSize: 11 }}
                      disabled={busy === a.id} onClick={() => decide(a, "approve")}>
                      {busy === a.id ? "Working…" : a.outward ? "Approve & send" : "Approve"}
                    </button>
                    <button className="crm-btn crm-btn--ghost" style={{ fontSize: 11 }}
                      disabled={busy === a.id} onClick={() => decide(a, "reject")}>
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </Section>
          )}

          {!!settled.length && (
            <Section title="Actions taken">
              {settled.map((a) => (
                <div key={a.id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12,
                  padding: "11px 14px", background: "var(--crm-charcoal)",
                  borderBottom: "1px solid var(--crm-border-dark)", color: "var(--crm-warm-white)", fontSize: 13 }}>
                  <span style={{ color: STATUS_TONE[a.status], alignSelf: "center" }}>●</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block" }}>{a.title}</span>
                    <span style={{ display: "block", fontSize: 11, color: "var(--crm-taupe)", marginTop: 2 }}>
                      {ACTION_LABEL[a.kind] ?? a.kind}
                      {a.error && <span style={{ color: "#e07a5f" }}> · {a.error}</span>}
                    </span>
                  </span>
                  <span style={{ alignSelf: "center", fontSize: 11, color: STATUS_TONE[a.status] }}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                </div>
              ))}
            </Section>
          )}

          {!actions.length && run.status === "succeeded" && (
            <Section title="Actions">
              <Empty>Nothing needed doing. That is a valid result.</Empty>
            </Section>
          )}

          {(run.input_tokens || run.cache_read_tokens) && (
            <div style={{ fontSize: 11, color: "var(--crm-taupe)", fontStyle: "italic" }}>
              {run.input_tokens?.toLocaleString()} in · {run.output_tokens?.toLocaleString()} out
              {run.cache_read_tokens
                ? ` · ${run.cache_read_tokens.toLocaleString()} read from cache`
                : ""}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
