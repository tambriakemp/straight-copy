// Agents roster — the team of workers, what each is for, and what's waiting on you.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { Empty, Section, relTime } from "@/components/admin/DashboardPrimitives";
import AgentAvatar from "@/components/admin/AgentAvatar";
import {
  agentsApi, errMsg, AUTONOMY_LABEL, AUTONOMY_BLURB, describeCron,
  pushStatus, subscribeToPush, unsubscribeFromPush,
  type Agent,
} from "@/lib/agentsApi";

type PendingAction = {
  id: string; agent_id: string; agent_name: string; kind: string;
  outward: boolean; title: string; description: string | null; run_id: string; created_at: string;
};

const STATUS_TONE: Record<string, string> = {
  succeeded: "#9db8a6",
  failed: "#e07a5f",
  running: "#dbb172",
  skipped: "var(--crm-taupe)",
};

export default function Agents() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [push, setPush] = useState<string>("unsupported");

  const load = async () => {
    setLoading(true);
    try {
      const [list, acts] = await Promise.all([
        agentsApi<{ agents: Agent[] }>("/agents"),
        agentsApi<{ actions: PendingAction[] }>("/actions/pending"),
      ]);
      setAgents(list.agents);
      setPending(acts.actions);
    } catch (e) {
      toast.error(errMsg(e) || "Failed to load agents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); pushStatus().then(setPush); }, []);

  const runNow = async (agent: Agent) => {
    setRunning(agent.id);
    try {
      const res = await agentsApi<{ run_id: string; headline: string }>(
        `/agents/${agent.id}/run`, { method: "POST" },
      );
      toast.success(res.headline || `${agent.name} finished`);
      navigate(`/admin/agents/runs/${res.run_id}`);
    } catch (e) {
      toast.error(errMsg(e) || "Run failed");
    } finally {
      setRunning(null);
    }
  };

  const togglePush = async () => {
    try {
      if (push === "subscribed") {
        await unsubscribeFromPush();
        toast.success("Notifications turned off for this device");
      } else {
        await subscribeToPush();
        toast.success("Notifications on for this device");
      }
      setPush(await pushStatus());
    } catch (e) {
      toast.error(errMsg(e) || "Could not change notification setting");
    }
  };

  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__ghost">TEAM</div>

        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">Operations</div>
            <h1 className="roster__title">Your <em>agents</em></h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              Workers with a standing brief. Each runs on its own schedule, reports what it found,
              and proposes what should happen next — with only as much rope as you give it.
            </p>
          </div>
          <div className="roster__actions">
            {push !== "unsupported" && push !== "denied" && (
              <button className="crm-btn crm-btn--ghost" onClick={togglePush}>
                {push === "subscribed" ? "◉ Notifications on" : "○ Enable notifications"}
              </button>
            )}
          </div>
        </div>

        {!!pending.length && (
          <div style={{ marginBottom: 24 }}>
            <Section title={`Waiting for you — ${pending.length}`}>
              {pending.map((p) => (
                <button key={p.id} onClick={() => navigate(`/admin/agents/runs/${p.run_id}`)}
                  style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, width: "100%",
                    padding: "12px 14px", textAlign: "left", background: "var(--crm-charcoal)",
                    borderBottom: "1px solid var(--crm-border-dark)", color: "var(--crm-warm-white)", cursor: "pointer" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{p.title}</div>
                    <div style={{ fontSize: 11, color: "var(--crm-taupe)", marginTop: 2 }}>
                      {p.agent_name}
                      {p.outward && <span style={{ color: "#dbb172" }}> · reaches a person</span>}
                    </div>
                  </div>
                  <div style={{ alignSelf: "center", fontSize: 11, color: "var(--crm-taupe)" }}>
                    {relTime(p.created_at)}
                  </div>
                </button>
              ))}
            </Section>
          </div>
        )}

        {loading ? (
          <p className="text-[hsl(30_8%_62%)] text-sm">Loading agents…</p>
        ) : !agents.length ? (
          <div className="crm-empty">
            <div className="crm-empty__glyph">∅</div>
            <div className="crm-empty__title">No <em>agents</em> configured.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {agents.map((a) => (
              <div key={a.id}
                style={{ padding: "18px 20px", background: "var(--crm-charcoal)",
                  border: "1px solid var(--crm-border-dark)", color: "var(--crm-warm-white)",
                  opacity: a.enabled ? 1 : 0.55 }}>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 16, alignItems: "start" }}>
                  <AgentAvatar name={a.name} url={a.avatar_url} accent={a.accent_color} size={56} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>
                      {a.role}
                    </div>
                    <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 28, marginTop: 4 }}>
                      {a.name}
                      {!a.enabled && (
                        <span style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
                          color: "var(--crm-taupe)", marginLeft: 10 }}>paused</span>
                      )}
                    </div>
                    {a.description && (
                      <p style={{ fontSize: 13, color: "var(--crm-taupe)", margin: "8px 0 0", maxWidth: 620 }}>
                        {a.description}
                      </p>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 12, fontSize: 11, color: "var(--crm-taupe)" }}>
                      <span>{AUTONOMY_LABEL[a.autonomy]}</span>
                      <span>·</span>
                      <span>{describeCron(a.schedule_cron)}</span>
                      {a.last_run && (
                        <>
                          <span>·</span>
                          <span style={{ color: STATUS_TONE[a.last_run.status] }}>
                            last run {relTime(a.last_run.started_at)}
                          </span>
                        </>
                      )}
                      {!!a.pending_actions && (
                        <>
                          <span>·</span>
                          <span style={{ color: "#dbb172" }}>{a.pending_actions} awaiting approval</span>
                        </>
                      )}
                    </div>
                    {a.last_run?.headline && (
                      <div style={{ fontSize: 13, marginTop: 10, fontStyle: "italic", color: "var(--crm-warm-white)" }}>
                        “{a.last_run.headline}”
                      </div>
                    )}
                  </div>
                  <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                    <button className="crm-btn crm-btn--ghost" style={{ fontSize: 11 }}
                      onClick={() => navigate(`/admin/agents/${a.id}`)}>
                      Configure
                    </button>
                    <button className="crm-btn crm-btn--bronze" style={{ fontSize: 11 }}
                      disabled={running === a.id} onClick={() => runNow(a)}>
                      {running === a.id ? "Running…" : "Run now"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: 11, color: "var(--crm-taupe)", marginTop: 20, maxWidth: 620, fontStyle: "italic" }}>
          {AUTONOMY_BLURB.propose} Change any agent's autonomy from its configure screen.
        </p>
      </div>
    </AdminLayout>
  );
}
