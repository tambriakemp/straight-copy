// One agent run — the brief it wrote, and the actions waiting on your call.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import AdminLayout from "@/components/admin/AdminLayout";
import { Empty, Section, relTime } from "@/components/admin/DashboardPrimitives";
import AgentActionCards from "@/components/admin/agent/AgentActionCards";
import { agentsApi, errMsg, type AgentRun, type AgentAction } from "@/lib/agentsApi";

type Payload = {
  run: AgentRun;
  agent: { id: string; key: string; name: string; role: string; autonomy: string } | null;
  actions: AgentAction[];
};

export default function AgentRunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

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
              className="crm-btn crm-btn--ghost" style={{ fontSize: 13, marginBottom: 10 }}>
              ← {agent?.name ?? "Agents"}
            </button>
            <div className="roster__eyebrow">
              {agent?.role} · {run.trigger} run · {relTime(run.started_at)}
            </div>
            <h1 className="roster__title" style={{ fontSize: "clamp(24px, 2.2vw, 30px)" }}>
              {run.headline ?? (run.status === "failed" ? "Run failed" : "Run")}
            </h1>
            <hr className="roster__rule" />
          </div>
        </div>

        {run.status === "failed" && (
          <div style={{ padding: "14px 16px", background: "var(--crm-charcoal)",
            border: "1px solid #e07a5f", color: "#e07a5f", fontSize: 15, marginBottom: 24 }}>
            {run.error ?? "The run failed with no error recorded."}
          </div>
        )}

        <div style={{ display: "grid", gap: 24 }}>
          {run.summary && (
            <Section title="The brief">
              <div className="prose prose-invert prose-sm"
                style={{ padding: 18, background: "var(--crm-charcoal)", color: "var(--crm-warm-white)",
                  fontSize: 16, lineHeight: 1.7, maxWidth: "none" }}>
                <ReactMarkdown>{run.summary}</ReactMarkdown>
              </div>
            </Section>
          )}

          {/* Same block the chat renders — one place decides how an action looks. */}
          {!!actions.length && (
            <Section title={pending.length ? `Waiting for you — ${pending.length}` : "Actions"}>
              <div style={{ padding: 14 }}>
                <AgentActionCards actions={actions} onSettled={load} />
              </div>
            </Section>
          )}

          {!actions.length && run.status === "succeeded" && (
            <Section title="Actions">
              <Empty>Nothing needed doing. That is a valid result.</Empty>
            </Section>
          )}

          {(run.input_tokens || run.cache_read_tokens) && (
            <div style={{ fontSize: 13, color: "var(--crm-taupe)", fontStyle: "italic" }}>
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
