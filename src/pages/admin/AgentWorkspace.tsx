// The agent workspace: rail, chat, activity.
//
// Clicking an agent lands here rather than on a settings form, because the thing
// you usually want is to talk to it. Settings are one click away in the rail.
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import AgentAvatar from "@/components/admin/AgentAvatar";
import AgentChatPanel from "@/components/admin/agent/AgentChatPanel";
import AgentActivityPanel, { type ActivityRun } from "@/components/admin/agent/AgentActivityPanel";
import AgentSettingsPanel from "@/components/admin/agent/AgentSettingsPanel";
import { agentsApi, errMsg, type Agent } from "@/lib/agentsApi";

type View = "chat" | "agent";

const RAIL: Array<{ view: View; label: string; glyph: string }> = [
  { view: "chat", label: "Chat", glyph: "◍" },
  { view: "agent", label: "Agent", glyph: "⚙" },
];

// Shown greyed so the shape of what is coming is visible, without pretending
// these work yet.
const SOON = ["Profile", "Integrations", "Monitoring"];

export default function AgentWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = (params.get("view") as View) || "chat";

  const [agent, setAgent] = useState<Agent | null>(null);
  const [runs, setRuns] = useState<ActivityRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const loadAgent = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("agents").select("*").eq("id", id).maybeSingle();
    setAgent((data ?? null) as Agent | null);
  }, [id]);

  const loadRuns = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from("agent_runs")
      .select("id, status, trigger, headline, started_at")
      .eq("agent_id", id).order("started_at", { ascending: false }).limit(60);
    setRuns((data ?? []) as ActivityRun[]);
  }, [id]);

  useEffect(() => {
    (async () => {
      await Promise.all([loadAgent(), loadRuns()]);
      setLoading(false);
    })();
  }, [loadAgent, loadRuns]);

  const runNow = async () => {
    if (!agent) return;
    setRunning(true);
    try {
      const res = await agentsApi<{ run_id: string; headline: string }>(
        `/agents/${agent.id}/run`, { method: "POST" },
      );
      toast.success(res.headline || `${agent.name} finished`);
      loadRuns();
    } catch (e) {
      toast.error(errMsg(e) || "Run failed");
    } finally {
      setRunning(false);
    }
  };

  const setView = (v: View) => {
    params.set("view", v);
    setParams(params, { replace: true });
  };

  if (loading) {
    return <AdminLayout><div className="roster"><p className="text-[hsl(30_8%_62%)] text-sm">Loading…</p></div></AdminLayout>;
  }
  if (!agent) {
    return <AdminLayout><div className="roster"><p className="text-[hsl(30_8%_62%)] text-sm">Agent not found.</p></div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="ws">
        {/* ---------- rail ---------- */}
        <nav className="ws__rail">
          <div className="ws__portrait">
            <AgentAvatar name={agent.name} url={agent.avatar_url}
              accent={agent.accent_color} size={200} />
            <span className="ws__portrait-status"
              style={{ background: agent.enabled ? "#4ade80" : "var(--crm-taupe)" }} />
            <span className="ws__portrait-name">{agent.name}</span>
          </div>

          <div className="ws__rail-actions">
            <button className="ws__rail-run" disabled={running} onClick={runNow}>
              {running ? "Running…" : "▷ Run now"}
            </button>
          </div>

          <div className="ws__rail-role">{agent.role}</div>

          <div className="ws__rail-group">
            {RAIL.map((r) => (
              <button key={r.view}
                className={`ws__rail-item ${view === r.view ? "ws__rail-item--on" : ""}`}
                onClick={() => setView(r.view)}>
                <span className="ws__rail-glyph">{r.glyph}</span>{r.label}
              </button>
            ))}
          </div>

          <div className="ws__rail-label">Coming soon</div>
          <div className="ws__rail-group">
            {SOON.map((s) => (
              <span key={s} className="ws__rail-item ws__rail-item--soon">
                <span className="ws__rail-glyph">◌</span>{s}
              </span>
            ))}
          </div>

          <button className="ws__rail-back" onClick={() => navigate("/admin")}>← All agents</button>
        </nav>

        {/* ---------- middle ---------- */}
        {view === "chat"
          ? <AgentChatPanel agent={agent} onActivity={loadRuns} />
          : <AgentSettingsPanel agent={agent} onChanged={loadAgent} />}

        {/* ---------- activity ---------- */}
        <AgentActivityPanel runs={runs} />
      </div>
    </AdminLayout>
  );
}
