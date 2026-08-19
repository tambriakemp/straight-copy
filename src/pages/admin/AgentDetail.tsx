// Agent configuration — autonomy, schedule, delivery, and run history.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { Empty, Section, relTime } from "@/components/admin/DashboardPrimitives";
import {
  agentsApi, errMsg, AUTONOMY_LABEL, AUTONOMY_BLURB, describeCron,
  type Agent, type Autonomy,
} from "@/lib/agentsApi";

type RunSummary = {
  id: string; status: string; trigger: string; headline: string | null;
  started_at: string; finished_at: string | null; error: string | null;
};

const AUTONOMY_ORDER: Autonomy[] = ["propose", "act_in_app", "autonomous"];

const CHANNELS: Array<{ key: string; label: string; blurb: string }> = [
  { key: "in_app", label: "In-app", blurb: "Always on. The run and the dashboard feed." },
  { key: "email", label: "Email", blurb: "Sends the brief to your inbox." },
  { key: "tasks", label: "Tasks", blurb: "Findings become real tasks on the board." },
  { key: "push", label: "Push", blurb: "Only fires when something needs approval." },
];

const SCHEDULES: Array<{ label: string; cron: string | null }> = [
  { label: "Manual only", cron: null },
  { label: "Daily, 13:00 UTC", cron: "0 13 * * *" },
  { label: "Weekdays, 12:00 UTC", cron: "0 12 * * 1-5" },
  { label: "Mondays, 12:00 UTC", cron: "0 12 * * 1" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
];

const STATUS_TONE: Record<string, string> = {
  succeeded: "#9db8a6", failed: "#e07a5f", running: "#dbb172",
};

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState("");

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await agentsApi<{ agent: Agent; runs: RunSummary[] }>(`/agents/${id}`);
      setAgent(res.agent);
      setRuns(res.runs);
      setPrompt(res.agent.system_prompt ?? "");
    } catch (e) {
      toast.error(errMsg(e) || "Failed to load agent");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const patch = async (body: Record<string, unknown>, note?: string) => {
    if (!id) return;
    setSaving(true);
    try {
      const res = await agentsApi<{ agent: Agent }>(`/agents/${id}`, { method: "PATCH", body });
      setAgent(res.agent);
      if (note) toast.success(note);
    } catch (e) {
      toast.error(errMsg(e) || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <AdminLayout><div className="roster"><p className="text-[hsl(30_8%_62%)] text-sm">Loading…</p></div></AdminLayout>;
  }
  if (!agent) {
    return <AdminLayout><div className="roster"><Empty>Agent not found.</Empty></div></AdminLayout>;
  }

  const delivery = agent.delivery ?? {};

  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__ghost">{agent.name.slice(0, 4).toUpperCase()}</div>

        <div className="roster__head">
          <div className="roster__title-block">
            <button onClick={() => navigate("/admin/agents")} className="crm-btn crm-btn--ghost"
              style={{ fontSize: 11, marginBottom: 10 }}>← All agents</button>
            <div className="roster__eyebrow">{agent.role}</div>
            <h1 className="roster__title">{agent.name}</h1>
            <hr className="roster__rule" />
            {agent.description && <p className="roster__sub">{agent.description}</p>}
          </div>
          <div className="roster__actions">
            <button className="crm-btn crm-btn--ghost"
              onClick={() => patch({ enabled: !agent.enabled }, agent.enabled ? "Paused" : "Resumed")}>
              {agent.enabled ? "Pause agent" : "Resume agent"}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 24 }}>
          <Section title="How much rope">
            <div style={{ padding: 16, display: "grid", gap: 10 }}>
              {AUTONOMY_ORDER.map((level) => (
                <button key={level} onClick={() => patch({ autonomy: level }, `${agent.name} now ${AUTONOMY_LABEL[level].toLowerCase()}`)}
                  disabled={saving}
                  style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, textAlign: "left",
                    padding: "12px 14px", cursor: "pointer", color: "var(--crm-warm-white)",
                    background: agent.autonomy === level ? "var(--crm-ink)" : "transparent",
                    border: `1px solid ${agent.autonomy === level ? "var(--crm-warm-white)" : "var(--crm-border-dark)"}` }}>
                  <span style={{ alignSelf: "start", color: agent.autonomy === level ? "#9db8a6" : "var(--crm-taupe)" }}>
                    {agent.autonomy === level ? "●" : "○"}
                  </span>
                  <span>
                    <span style={{ fontSize: 14 }}>{AUTONOMY_LABEL[level]}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--crm-taupe)", marginTop: 3 }}>
                      {AUTONOMY_BLURB[level]}
                    </span>
                  </span>
                </button>
              ))}
              {agent.autonomy === "autonomous" && (
                <p style={{ fontSize: 12, color: "#dbb172", margin: 0 }}>
                  This agent can now email real people without you reading the draft first.
                </p>
              )}
            </div>
          </Section>

          <Section title="Schedule">
            <div style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SCHEDULES.map((s) => (
                  <button key={s.label} disabled={saving}
                    onClick={() => patch({ schedule_cron: s.cron }, "Schedule updated")}
                    style={{ padding: "8px 12px", fontSize: 12, cursor: "pointer",
                      color: "var(--crm-warm-white)",
                      background: agent.schedule_cron === s.cron ? "var(--crm-ink)" : "transparent",
                      border: `1px solid ${agent.schedule_cron === s.cron ? "var(--crm-warm-white)" : "var(--crm-border-dark)"}` }}>
                    {s.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "var(--crm-taupe)" }}>
                Currently: {describeCron(agent.schedule_cron)}
                {agent.next_run_at && ` · next run ${new Date(agent.next_run_at).toLocaleString()}`}
              </div>
              <p style={{ fontSize: 11, color: "var(--crm-taupe)", margin: 0, fontStyle: "italic" }}>
                The dispatcher wakes every 15 minutes, so a run starts within 15 minutes of its scheduled time.
              </p>
            </div>
          </Section>

          <Section title="Where its output goes">
            <div style={{ padding: 16, display: "grid", gap: 10 }}>
              {CHANNELS.map((c) => {
                const on = c.key === "in_app" ? true : !!delivery[c.key];
                const locked = c.key === "in_app";
                return (
                  <button key={c.key} disabled={saving || locked}
                    onClick={() => patch({ delivery: { ...delivery, [c.key]: !on } })}
                    style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, textAlign: "left",
                      padding: "10px 12px", cursor: locked ? "default" : "pointer",
                      color: "var(--crm-warm-white)", background: "transparent",
                      border: "1px solid var(--crm-border-dark)", opacity: locked ? 0.7 : 1 }}>
                    <span style={{ color: on ? "#9db8a6" : "var(--crm-taupe)" }}>{on ? "●" : "○"}</span>
                    <span>
                      <span style={{ fontSize: 13 }}>{c.label}</span>
                      <span style={{ display: "block", fontSize: 11, color: "var(--crm-taupe)", marginTop: 2 }}>
                        {c.blurb}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Its brief">
            <div style={{ padding: 16, display: "grid", gap: 10 }}>
              <p style={{ fontSize: 12, color: "var(--crm-taupe)", margin: 0 }}>
                Leave empty to use the built-in brief for this role. Anything here replaces it —
                the shared house rules about tone and how money is counted always still apply.
              </p>
              <textarea className="crm-input" rows={8} value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Override this agent's mission…"
                style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, lineHeight: 1.6 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="crm-btn crm-btn--bronze" disabled={saving}
                  onClick={() => patch({ system_prompt: prompt.trim() || null }, "Brief saved")}>
                  Save brief
                </button>
                {agent.system_prompt && (
                  <button className="crm-btn crm-btn--ghost" disabled={saving}
                    onClick={() => { setPrompt(""); patch({ system_prompt: null }, "Reverted to the built-in brief"); }}>
                    Reset to default
                  </button>
                )}
              </div>
            </div>
          </Section>

          <Section title="Run history">
            {!runs.length ? <Empty>No runs yet.</Empty> : (
              <div>
                {runs.map((r) => (
                  <button key={r.id} onClick={() => navigate(`/admin/agents/runs/${r.id}`)}
                    style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, width: "100%",
                      padding: "12px 14px", textAlign: "left", background: "var(--crm-charcoal)",
                      borderBottom: "1px solid var(--crm-border-dark)", color: "var(--crm-warm-white)", cursor: "pointer" }}>
                    <span style={{ color: STATUS_TONE[r.status] ?? "var(--crm-taupe)", alignSelf: "center" }}>●</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13 }}>
                        {r.headline ?? (r.status === "failed" ? (r.error ?? "Run failed") : "Run")}
                      </span>
                      <span style={{ display: "block", fontSize: 11, color: "var(--crm-taupe)", marginTop: 2 }}>
                        {r.trigger} · {relTime(r.started_at)}
                      </span>
                    </span>
                    <span style={{ alignSelf: "center", fontSize: 11, color: "var(--crm-taupe)" }}>→</span>
                  </button>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </AdminLayout>
  );
}
