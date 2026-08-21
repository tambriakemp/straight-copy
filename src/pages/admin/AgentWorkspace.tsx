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
import AgentProposalPanel from "@/components/admin/agent/AgentProposalPanel";
import { useFocusedProposal } from "@/components/admin/agent/useFocusedProposal";
import { useAsideWidth } from "@/components/admin/agent/useAsideWidth";
import { agentsApi, errMsg, type Agent } from "@/lib/agentsApi";
import { capabilitiesFor } from "@/lib/agentCapabilities";

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
  // Bumped after a run so the chat pane reloads and shows the brief it wrote.
  const [chatNonce, setChatNonce] = useState(0);
  const [aside, setAside] = useState<"activity" | "document">("activity");
  const { width: asideWidth, dragging, startDrag } = useAsideWidth();

  const { proposal, loading: proposalLoading } = useFocusedProposal(id ?? "", chatNonce);
  const proposalSections = proposal?.content?.sections?.filter(
    (sec) => (sec.body ?? "").trim().length > 0,
  ).length ?? 0;

  // Follow the work. When she asks for a proposal and sections start landing,
  // the document should be what she is looking at — not something she has to
  // know to go and click.
  useEffect(() => {
    if (proposalSections > 0) setAside("document");
  }, [proposalSections]);

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

  /**
   * Run the agent and put the result in the chat.
   *
   * A run used to land only in the activity list, so reading what the agent
   * found meant leaving the page you were talking to it on. The brief is a
   * message from the agent — it belongs in the thread with everything else it
   * has said, where you can reply to it.
   */
  const runNow = async () => {
    if (!agent) return;
    setRunning(true);
    try {
      const res = await agentsApi<{ run_id: string; headline: string }>(
        `/agents/${agent.id}/run`, { method: "POST" },
      );

      // Written client-side rather than by the run itself: the run has no idea
      // which thread you are reading, and this way it lands in the one you are
      // looking at.
      if (res.run_id) {
        const { data: run } = await supabase.from("agent_runs")
          .select("id, headline, summary").eq("id", res.run_id).maybeSingle();
        // The actions are the half of a brief you can act on. Attaching them to
        // the chat message is what makes the run readable there rather than a
        // headline with a link to where the real thing lives.
        const { data: acts } = await supabase.from("agent_actions")
          .select("id").eq("run_id", res.run_id);
        const actionIds = (acts ?? []).map((a) => a.id);

        if (run) {
          let convId: string | null = null;
          const { data: conv } = await supabase.from("agent_conversations")
            .select("id").eq("agent_id", agent.id)
            .order("updated_at", { ascending: false }).limit(1).maybeSingle();
          if (conv) {
            convId = conv.id;
          } else {
            const { data: created } = await supabase.from("agent_conversations")
              .insert({ agent_id: agent.id, title: "Chat" }).select("id").maybeSingle();
            convId = created?.id ?? null;
          }
          if (convId) {
            const headline = run.headline ? `**${run.headline}**\n\n` : "";
            await supabase.from("agent_messages").insert({
              conversation_id: convId,
              role: "assistant",
              content: `${headline}${run.summary ?? ""}`.trim() || "Run finished with nothing to report.",
              run_id: run.id,
              action_ids: actionIds,
              status: "complete",
            });
            setChatNonce((n) => n + 1);
            setView("chat");
          }
        }
      }

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
      <div className="ws" style={{ gridTemplateColumns: `232px minmax(0, 1fr) ${asideWidth}px` }}>
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

          {capabilitiesFor(agent.key).length > 0 && (
            <ul className="ws__rail-caps">
              {capabilitiesFor(agent.key).map((cap) => (
                <li key={cap}>{cap}</li>
              ))}
            </ul>
          )}

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
          ? <AgentChatPanel agent={agent} onActivity={loadRuns} reloadNonce={chatNonce} />
          : <AgentSettingsPanel agent={agent} onChanged={loadAgent} />}

        {/* ---------- activity / document ---------- */}
        <aside className="ws__aside">
          {/* A 24,000-character document in a 400px column is unreadable. Drag
              to trade chat width for document width; the choice persists. */}
          <div
            className={`ws__aside-grip${dragging ? " is-dragging" : ""}`}
            onMouseDown={startDrag}
            onDoubleClick={() => startDrag(null)}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the side panel"
            title="Drag to resize · double-click to reset"
          />
          <div className="ws__aside-tabs">
            <button
              className={`ws__aside-tab${aside === "activity" ? " is-on" : ""}`}
              onClick={() => setAside("activity")}
            >
              Activity
            </button>
            <button
              className={`ws__aside-tab${aside === "document" ? " is-on" : ""}`}
              onClick={() => setAside("document")}
            >
              Document{proposalSections ? ` · ${proposalSections}` : ""}
            </button>
          </div>
          {aside === "activity"
            ? <AgentActivityPanel runs={runs} />
            : <AgentProposalPanel proposal={proposal} loading={proposalLoading} agentName={agent.name} />}
        </aside>
      </div>
    </AdminLayout>
  );
}
