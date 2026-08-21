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
import { supabase } from "@/integrations/supabase/client";
import {
  errMsg, describeCron, nextRunFromCron, cadenceOf,
  pushStatus, subscribeToPush, unsubscribeFromPush,
} from "@/lib/agentsApi";

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

type PendingAction = {
  id: string; run_id: string; agent_id: string; agent_name: string;
  kind: string; outward: boolean; title: string; created_at: string;
};

type Payload = {
  agents: AgentCard[];
  pending: PendingAction[];
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
  const [push, setPush] = useState<string>("unsupported");

  /**
   * Read straight from the tables.
   *
   * Every one of these is already readable by an admin under RLS, so putting an
   * edge function in front of them only added a deploy that could lag behind
   * the UI — which is exactly what left this screen blank. The counts come from
   * project_tasks and client_projects, so they are the same numbers the task
   * board shows.
   */
  const load = async () => {
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

      const [
        agentsRes, runsRes, pendingRes,
        openRes, overdueRes, projectsActiveRes, reviewRes,
        readyRes, upcomingRes, projectsRes,
      ] = await Promise.all([
        supabase.from("agents").select("*").order("created_at"),
        supabase.from("agent_runs")
          .select("id, agent_id, status, headline, started_at")
          .order("started_at", { ascending: false }).limit(120),
        supabase.from("agent_pending_actions_v").select("*").limit(30),

        supabase.from("project_tasks").select("id", { count: "exact", head: true })
          .neq("status", "complete"),
        supabase.from("project_tasks").select("id", { count: "exact", head: true })
          .neq("status", "complete").lt("due_date", todayIso),
        supabase.from("client_projects").select("id", { count: "exact", head: true })
          .eq("status", "active"),
        supabase.from("project_tasks").select("id", { count: "exact", head: true })
          .eq("status", "needs_review"),

        supabase.from("project_tasks")
          .select("id, name, client_project_id, due_date, order_index")
          .eq("status", "ready_for_claude").order("order_index").limit(12),
        supabase.from("project_tasks")
          .select("id, name, client_project_id, due_date, status")
          .neq("status", "complete").not("due_date", "is", null).lte("due_date", in14)
          .order("due_date", { ascending: true }).limit(20),
        supabase.from("client_projects").select("id, client_id, name"),
      ]);

      // --- agent cards ---
      const pendingBy: Record<string, number> = {};
      for (const row of pendingRes.data ?? []) {
        if (row.agent_id) pendingBy[row.agent_id] = (pendingBy[row.agent_id] ?? 0) + 1;
      }
      const runsBy: Record<string, RunLine[]> = {};
      for (const r of runsRes.data ?? []) {
        (runsBy[r.agent_id] ??= []).push(r as RunLine);
      }

      const agents: AgentCard[] = (agentsRes.data ?? []).map((a) => ({
        id: a.id, key: a.key, name: a.name, role: a.role,
        description: a.description, enabled: a.enabled, autonomy: a.autonomy,
        avatar_url: a.avatar_url, accent_color: a.accent_color,
        schedule_cron: a.schedule_cron, last_run_at: a.last_run_at,
        next_run_at: a.next_run_at ?? nextRunFromCron(a.schedule_cron)?.toISOString() ?? null,
        pending_actions: pendingBy[a.id] ?? 0,
        recent: (runsBy[a.id] ?? []).slice(0, 4),
      }));

      // --- naming for the up-next feed ---
      const projMap: Record<string, { name: string | null; client_id: string }> = {};
      for (const p of projectsRes.data ?? []) {
        projMap[p.id] = { name: p.name, client_id: p.client_id };
      }
      const clientIds = [...new Set(Object.values(projMap).map((p) => p.client_id))];
      const clientName: Record<string, string> = {};
      if (clientIds.length) {
        const { data: cls } = await supabase.from("clients")
          .select("id, business_name, contact_name").in("id", clientIds);
        for (const c of cls ?? []) {
          clientName[c.id] = c.business_name || c.contact_name || "Untitled";
        }
      }
      const where = (projectId: string | null) => {
        const p = projectId ? projMap[projectId] : null;
        if (!p) return null;
        return [clientName[p.client_id], p.name].filter(Boolean).join(" · ") || null;
      };

      // --- up next: queue, dated work, scheduled runs ---
      const upNext: UpNextItem[] = [];
      const seen = new Set<string>();

      for (const t of readyRes.data ?? []) {
        seen.add(t.id);
        upNext.push({
          kind: "queue", id: t.id, title: t.name, subtitle: where(t.client_project_id),
          at: t.due_date, badge: "ready", client_project_id: t.client_project_id,
        });
      }
      for (const t of upcomingRes.data ?? []) {
        if (seen.has(t.id)) continue;   // already in the queue list above
        seen.add(t.id);
        upNext.push({
          kind: "task", id: t.id, title: t.name, subtitle: where(t.client_project_id),
          at: t.due_date,
          badge: t.due_date && t.due_date < todayIso ? "overdue" : null,
          client_project_id: t.client_project_id,
        });
      }
      for (const a of agents) {
        if (!a.enabled || !a.next_run_at) continue;
        upNext.push({
          kind: "agent", id: `agent-${a.id}`, title: `${a.name} — scheduled run`,
          subtitle: a.role, at: a.next_run_at,
          badge: cadenceOf(a.schedule_cron), agent_id: a.id,
        });
      }

      // Undated work is real, but it is not "next" — it sorts last.
      upNext.sort((x, y) => {
        if (!x.at && !y.at) return 0;
        if (!x.at) return 1;
        if (!y.at) return -1;
        return x.at.localeCompare(y.at);
      });

      setData({
        agents,
        pending: (pendingRes.data ?? []) as PendingAction[],
        stats: {
          open_tasks: openRes.count ?? 0,
          overdue_tasks: overdueRes.count ?? 0,
          active_projects: projectsActiveRes.count ?? 0,
          needs_review: reviewRes.count ?? 0,
        },
        up_next: upNext.slice(0, 25),
        total_pending: pendingRes.data?.length ?? 0,
      });
    } catch (e) {
      toast.error(errMsg(e) || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); pushStatus().then(setPush); }, []);

  const togglePush = async () => {
    try {
      if (push === "subscribed") {
        await unsubscribeFromPush();
        toast.success("Notifications off for this device");
      } else {
        await subscribeToPush();
        toast.success("Notifications on for this device");
      }
      setPush(await pushStatus());
    } catch (e) {
      toast.error(errMsg(e) || "Could not change notification setting");
    }
  };

  const stats = data?.stats;
  const pending = data?.pending ?? [];
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
                    <AgentAvatar name={a.name} url={a.avatar_url} accent={a.accent_color} size={104} />
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
                  </div>
                </div>
              ))}
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

          {!!pending.length && (
            <div className="dash__upnext">
              <div className="dash__upnext-head" style={{ color: "#dbb172" }}>
                Waiting for you — {pending.length}
              </div>
              {pending.map((p) => (
                <button key={p.id} className="upnext__row"
                  onClick={() => navigate(`/admin/agents/runs/${p.run_id}`)}>
                  <span className="upnext__time" style={{ color: "#dbb172" }}>▲</span>
                  <span className="upnext__body">
                    <span className="upnext__title">{p.title}</span>
                    <span className="upnext__sub">
                      {p.agent_name}{p.outward ? " · reaches a person" : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="dash__upnext">
            <div className="dash__upnext-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Up next</span>
              {push !== "unsupported" && push !== "denied" && (
                <button onClick={togglePush}
                  style={{ background: "transparent", border: "none", cursor: "pointer",
                    fontSize: 11.5, letterSpacing: "0.18em", textTransform: "uppercase",
                    color: push === "subscribed" ? "#9db8a6" : "var(--crm-taupe)" }}>
                  {push === "subscribed" ? "◉ Alerts on" : "○ Alerts off"}
                </button>
              )}
            </div>
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
