// The home screen: your team of agents, what needs attention, and what is next.
//
// Deliberately not an analytics page — those moved to /admin/portfolio. This
// answers "who is working on what, and what should I look at" and nothing else.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { relTime } from "@/components/admin/DashboardPrimitives";
import AgentAvatar from "@/components/admin/AgentAvatar";
import { agentsApi, errMsg, describeCron } from "@/lib/agentsApi";

type RunLine = {
  id: string;
  status: "running" | "succeeded" | "failed" | "skipped";
  headline: string | null;
  started_at: string;
};

type AgentCard = {
  id: string; key: string; name: string; role: string;
  description: string | null; enabled: boolean; autonomy: string;
  avatar_url: string | null; accent_color: string | null;
  schedule_cron: string | null; last_run_at: string | null; next_run_at: string | null;
  pending_actions: number;
  recent: RunLine[];
};

type UpNextItem = {
  kind: "queue" | "task" | "agent";
  id: string; title: string; subtitle: string | null;
  at: string | null; badge: string | null;
  agent_id?: string; client_project_id?: string | null;
};

type Payload = {
  agents: AgentCard[];
  stats: { open_tasks: number; overdue_tasks: number; active_projects: number; needs_review: number };
  up_next: UpNextItem[];
  total_pending: number;
};

const RUN_TONE: Record<string, string> = {
  succeeded: "#9db8a6", failed: "#e07a5f", running: "#dbb172", skipped: "var(--crm-taupe)",
};

const BADGE_TONE: Record<string, string> = {
  overdue: "#e07a5f", ready: "#9db8a6", daily: "#9db8a6", weekly: "#8fa8c4", weekdays: "#8fa8c4",
};

/** Clock time for a timestamp, or the date for a plain yyyy-mm-dd. */
function whenLabel(at: string | null): string {
  if (!at) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(at)) {
    const d = new Date(`${at}T12:00:00Z`);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Group heading for the up-next feed. */
function dayBucket(at: string | null): string {
  if (!at) return "No date";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(at) ? `${at}T12:00:00Z` : at);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff <= 7) return day.toLocaleDateString(undefined, { weekday: "long" });
  return day.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  const load = async () => {
    try {
      setData(await agentsApi<Payload>("/dashboard"));
    } catch (e) {
      toast.error(errMsg(e) || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const runNow = async (agent: AgentCard) => {
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

  const stats = data?.stats;
  const upNext = data?.up_next ?? [];

  // Group the feed by day so it reads as a schedule, not a list.
  const buckets: Array<{ label: string; items: UpNextItem[] }> = [];
  for (const item of upNext) {
    const label = dayBucket(item.at);
    const last = buckets[buckets.length - 1];
    if (last?.label === label) last.items.push(item);
    else buckets.push({ label, items: [item] });
  }

  return (
    <AdminLayout>
      <div className="dash">
        <div className="dash__main">
          {loading ? (
            <p className="text-[hsl(30_8%_62%)] text-sm">Loading…</p>
          ) : (
            <div className="dash__agents">
              {(data?.agents ?? []).map((a) => (
                <div key={a.id} className="agent-card" style={{ opacity: a.enabled ? 1 : 0.55 }}>
                  <button className="agent-card__head" onClick={() => navigate(`/admin/agents/${a.id}`)}>
                    <AgentAvatar name={a.name} url={a.avatar_url} accent={a.accent_color} size={64} />
                    <span className="agent-card__id">
                      <span className="agent-card__name">
                        {a.name}
                        <span className="agent-card__chev">›</span>
                      </span>
                      <span className="agent-card__role">{a.role}</span>
                      {!a.enabled && <span className="agent-card__paused">Paused</span>}
                    </span>
                  </button>

                  <div className="agent-card__log">
                    {a.recent.length === 0 ? (
                      <div className="agent-card__empty">No runs yet</div>
                    ) : (
                      a.recent.map((r) => (
                        <button key={r.id} className="agent-card__line"
                          onClick={() => navigate(`/admin/agents/runs/${r.id}`)}>
                          <span className="agent-card__ago">{relTime(r.started_at)}</span>
                          <span className="agent-card__dot" style={{ color: RUN_TONE[r.status] }}>●</span>
                          <span className="agent-card__what">
                            {r.headline ?? (r.status === "failed" ? "Run failed" : "Run")}
                          </span>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="agent-card__foot">
                    <span className="agent-card__sched">{describeCron(a.schedule_cron)}</span>
                    {a.pending_actions > 0 && (
                      <span className="agent-card__pending">{a.pending_actions} to approve</span>
                    )}
                    <button className="agent-card__run" disabled={running === a.id}
                      onClick={() => runNow(a)}>
                      {running === a.id ? "Running…" : "Run now"}
                    </button>
                  </div>
                </div>
              ))}

              {/* Grow-your-team card, as in the reference. */}
              <button className="agent-card agent-card--new" onClick={() => navigate("/admin/agents")}>
                <span className="agent-card--new__pill">Grow your team</span>
                <span className="agent-card--new__row">
                  {["◐", "◓", "◑", "◒", "◐"].map((g, i) => (
                    <span key={i} className="agent-card--new__slot" style={{ opacity: 0.25 + i * 0.15 }}>{g}</span>
                  ))}
                </span>
                <span className="agent-card--new__copy">
                  More agents, more handled — give another corner of the business its own owner. →
                </span>
              </button>
            </div>
          )}
        </div>

        <aside className="dash__side">
          <div className="dash__stats">
            <button className="stat" onClick={() => navigate("/admin/tasks")}>
              <span className="stat__label">Open tasks</span>
              <span className="stat__value">{stats?.open_tasks ?? "—"}</span>
            </button>
            <button className="stat" onClick={() => navigate("/admin/tasks")}>
              <span className="stat__label">Overdue</span>
              <span className="stat__value" style={{ color: stats?.overdue_tasks ? "#e07a5f" : undefined }}>
                {stats?.overdue_tasks ?? "—"}
              </span>
            </button>
            <button className="stat" onClick={() => navigate("/admin/clients")}>
              <span className="stat__label">Active projects</span>
              <span className="stat__value">{stats?.active_projects ?? "—"}</span>
            </button>
            <button className="stat" onClick={() => navigate("/admin/tasks")}>
              <span className="stat__label">Needs review</span>
              <span className="stat__value" style={{ color: stats?.needs_review ? "#dbb172" : undefined }}>
                {stats?.needs_review ?? "—"}
              </span>
            </button>
          </div>

          <div className="dash__upnext">
            <div className="dash__upnext-head">Up next</div>
            {!buckets.length ? (
              <div className="agent-card__empty" style={{ padding: "18px 14px" }}>
                Nothing scheduled or queued.
              </div>
            ) : (
              buckets.map((b) => (
                <div key={b.label}>
                  <div className="upnext__day">{b.label}</div>
                  {b.items.map((item) => (
                    <button key={item.id} className="upnext__row"
                      onClick={() => {
                        if (item.kind === "agent" && item.agent_id) navigate(`/admin/agents/${item.agent_id}`);
                        else navigate("/admin/tasks");
                      }}>
                      <span className="upnext__time">{whenLabel(item.at)}</span>
                      <span className="upnext__body">
                        <span className="upnext__title">{item.title}</span>
                        {item.subtitle && <span className="upnext__sub">{item.subtitle}</span>}
                      </span>
                      {item.badge && (
                        <span className="upnext__badge"
                          style={{ color: BADGE_TONE[item.badge] ?? "var(--crm-taupe)",
                                   borderColor: BADGE_TONE[item.badge] ?? "var(--crm-border-dark)" }}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </AdminLayout>
  );
}
