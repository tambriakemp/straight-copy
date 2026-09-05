// The coding queue, visible.
//
// queue_fire_log has recorded every fire attempt since 20260822220000 and
// nothing read it, so "is the board actually reaching Claude?" was a question
// you could only answer in a SQL console. A queue that had quietly stopped
// firing looked identical to a queue with nothing to do.
//
// All four tables here are readable by admins under existing RLS
// (queue_fire_log: admins select; queue_fire_routes: admins manage;
// client_projects and project_tasks likewise), so this is a plain client-side
// page with no edge function behind it.
//
// The rules live in @/lib/queueHealth and are unit tested. Keep them there —
// judgement in a component is judgement nobody can test.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { Copy, RefreshCw } from "lucide-react";
import {
  CLAIM_TTL_MINUTES,
  countOutcomes,
  diagnose,
  outcomeMeta,
  projectQueueState,
  withinHours,
  type FireLogRow,
  type Finding,
  type ProjectRow,
  type RouteRow,
  type TaskRow,
  type Tone,
} from "@/lib/queueHealth";

const PANEL: React.CSSProperties = {
  background: "hsl(36 5% 16%)",
  padding: 28,
  marginBottom: 24,
};

const MUTED = "hsl(30 8% 62%)";
const BRIGHT = "hsl(40 20% 97%)";

const TONE_COLOR: Record<Tone, string> = {
  good: "hsl(140 40% 62%)",
  warn: "hsl(38 70% 64%)",
  bad: "hsl(6 65% 66%)",
  muted: MUTED,
};

const SEVERITY_COLOR: Record<Finding["severity"], string> = {
  critical: TONE_COLOR.bad,
  warning: TONE_COLOR.warn,
  info: MUTED,
  ok: TONE_COLOR.good,
};

const SEVERITY_LABEL: Record<Finding["severity"], string> = {
  critical: "Broken",
  warning: "Needs attention",
  info: "For information",
  ok: "Healthy",
};

function code(style: React.CSSProperties = {}): React.CSSProperties {
  return {
    fontFamily: "monospace",
    fontSize: 15,
    color: BRIGHT,
    background: "hsl(40 8% 10%)",
    padding: "2px 6px",
    ...style,
  };
}

function ago(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return `${formatDistanceToNowStrict(new Date(t))} ago`;
}

export default function QueueHealth() {
  const [log, setLog] = useState<FireLogRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [logRes, routeRes, projectRes, taskRes] = await Promise.all([
      supabase
        .from("queue_fire_log")
        .select("id,client_project_id,task_id,outcome,detail,fired_at")
        .order("fired_at", { ascending: false })
        .limit(100),
      supabase
        .from("queue_fire_routes")
        .select("id,client_project_id,secret_prefix,enabled,debounce_seconds")
        .order("created_at", { ascending: true }),
      supabase
        .from("client_projects")
        .select("id,name,type,queue_enabled,repo_url,repo_branch,toolchain,delivery_mode")
        .order("name", { ascending: true }),
      supabase
        .from("project_tasks")
        .select("id,name,client_project_id,status,assignee_kind,claimed_by,claimed_at")
        .eq("status", "ready_for_claude"),
    ]);

    const firstError = logRes.error ?? routeRes.error ?? projectRes.error ?? taskRes.error;
    if (firstError) toast.error(firstError.message);

    setLog((logRes.data as FireLogRow[]) ?? []);
    setRoutes((routeRes.data as RouteRow[]) ?? []);
    setProjects((projectRes.data as ProjectRow[]) ?? []);
    setTasks((taskRes.data as TaskRow[]) ?? []);
    setLoadedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const now = loadedAt ?? new Date();
  const findings = diagnose({ log, routes, projects, tasks, now });
  const last24 = withinHours(log, 24, now);
  const counts = countOutcomes(last24);
  const queueProjects = projects.filter((p) => p.queue_enabled);
  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? (id ? "unknown project" : "—");

  const hasDefaultRoute = routes.some((r) => r.client_project_id === null);

  const createDefaultRoute = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("queue_fire_routes")
      .insert({ client_project_id: null, secret_prefix: "agency_queue" });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Default route created — it now covers every board without its own route.");
    load();
  };

  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">Operations</div>
            <h1 className="roster__title">
              Coding <em>queue</em>
            </h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              Whether the board is reaching the coding worker, and what it said when it tried.
              Every fire attempt is logged, including the ones that were suppressed.
            </p>
          </div>
          <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-3 w-3" /> {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {/* ── Diagnosis ── */}
        <div style={PANEL}>
          <h2 className="font-serif italic text-xl" style={{ color: BRIGHT, marginBottom: 4 }}>
            What's wrong
          </h2>
          <p style={{ fontSize: 19, color: MUTED, marginBottom: 20 }}>
            Worst first. Anything with an exact remedy carries the SQL to fix it.
          </p>

          <div style={{ display: "grid", gap: 14 }}>
            {findings.map((finding, i) => (
              <div
                key={i}
                style={{
                  borderLeft: `3px solid ${SEVERITY_COLOR[finding.severity]}`,
                  paddingLeft: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: SEVERITY_COLOR[finding.severity],
                    marginBottom: 2,
                  }}
                >
                  {SEVERITY_LABEL[finding.severity]}
                </div>
                <div style={{ fontSize: 19, color: BRIGHT, marginBottom: 4 }}>{finding.title}</div>
                <div style={{ fontSize: 17, color: MUTED, lineHeight: 1.55 }}>{finding.detail}</div>
                {finding.fix && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "flex-start" }}>
                    <pre style={{ ...code({ padding: "10px 12px", flex: 1, margin: 0 }), whiteSpace: "pre-wrap" }}>
                      {finding.fix}
                    </pre>
                    <button
                      className="crm-btn crm-btn--ghost crm-btn--sm"
                      onClick={() => {
                        navigator.clipboard.writeText(finding.fix!);
                        toast.success("Copied");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {!hasDefaultRoute && (
            <div style={{ marginTop: 20, borderTop: "1px solid hsl(40 20% 97% / 0.06)", paddingTop: 16 }}>
              <p style={{ fontSize: 17, color: MUTED, marginBottom: 10 }}>
                There is no default route. One row covers every board that has no route of its own —
                which is what stops a new client's board from silently never firing.
              </p>
              <button className="crm-btn crm-btn--sm" onClick={createDefaultRoute} disabled={busy}>
                {busy ? "Creating…" : "Create default route (agency_queue)"}
              </button>
            </div>
          )}
        </div>

        {/* ── Last 24 hours ── */}
        <div style={PANEL}>
          <h2 className="font-serif italic text-xl" style={{ color: BRIGHT, marginBottom: 4 }}>
            Last 24 hours
          </h2>
          <p style={{ fontSize: 19, color: MUTED, marginBottom: 20 }}>
            {last24.length === 0
              ? "No fire attempts at all."
              : `${last24.length} fire ${last24.length === 1 ? "attempt" : "attempts"} across ${queueProjects.length} queue-enabled ${queueProjects.length === 1 ? "board" : "boards"}.`}
          </p>
          <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
            {Object.entries(counts).map(([outcome, n]) => {
              const meta = outcomeMeta(outcome);
              return (
                <div key={outcome} style={{ minWidth: 150 }}>
                  <div style={{ fontSize: 34, color: TONE_COLOR[meta.tone], lineHeight: 1.1 }}>{n}</div>
                  <div style={{ fontSize: 17, color: BRIGHT }}>{meta.label}</div>
                  <div style={{ fontSize: 15, color: MUTED, lineHeight: 1.45, marginTop: 4 }}>
                    {meta.meaning}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Boards ── */}
        <div style={PANEL}>
          <h2 className="font-serif italic text-xl" style={{ color: BRIGHT, marginBottom: 4 }}>
            Boards
          </h2>
          <p style={{ fontSize: 19, color: MUTED, marginBottom: 20 }}>
            Every project with the queue switched on, and the ready work sitting on it. A claim
            older than {CLAIM_TTL_MINUTES} minutes has expired and can be picked up again.
          </p>

          {queueProjects.length === 0 && (
            <p style={{ fontSize: 17, color: MUTED }}>
              No project has the queue switched on. Turn it on in a project's delivery targets —
              it needs a repository URL first.
            </p>
          )}

          <div style={{ display: "grid", gap: 18 }}>
            {queueProjects.map((project) => {
              const state = projectQueueState(project, routes, tasks, now);
              return (
                <div
                  key={project.id}
                  style={{ borderTop: "1px solid hsl(40 20% 97% / 0.06)", paddingTop: 14 }}
                >
                  <div style={{ fontSize: 20, color: BRIGHT }}>{project.name}</div>
                  <div style={{ fontSize: 16, color: MUTED, marginTop: 4, lineHeight: 1.6 }}>
                    <span style={code()}>{project.repo_url ?? "no repo"}</span>{" "}
                    on <span style={code()}>{project.repo_branch}</span>, {project.toolchain},
                    delivery <span style={code()}>{project.delivery_mode}</span>
                  </div>
                  <div style={{ fontSize: 16, color: MUTED, marginTop: 6 }}>
                    Route:{" "}
                    {state.route ? (
                      <>
                        <span style={code()}>{state.route.secret_prefix}</span>{" "}
                        {state.route.client_project_id === null ? "(default)" : "(this board only)"},
                        debounce {state.route.debounce_seconds}s
                      </>
                    ) : (
                      <span style={{ color: TONE_COLOR.bad }}>none — this board cannot fire</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 22, marginTop: 10, flexWrap: "wrap" }}>
                    <Stat n={state.waiting.length} label="waiting" tone="muted" />
                    <Stat n={state.inFlight.length} label="in flight" tone="good" />
                    <Stat n={state.stale.length} label="stale claim" tone="warn" />
                    <Stat n={state.invisible.length} label="invisible to queue" tone="bad" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Fire log ── */}
        <div style={PANEL}>
          <h2 className="font-serif italic text-xl" style={{ color: BRIGHT, marginBottom: 4 }}>
            Fire log
          </h2>
          <p style={{ fontSize: 19, color: MUTED, marginBottom: 20 }}>
            The last {log.length} attempts, newest first, straight from{" "}
            <span style={code()}>queue_fire_log</span>.
          </p>

          {log.length === 0 ? (
            <p style={{ fontSize: 17, color: MUTED }}>
              Empty. No task has ever reached <span style={code()}>ready_for_claude</span> on a
              queue-enabled board, so the path has never been exercised.
            </p>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {log.map((row) => {
                const meta = outcomeMeta(row.outcome);
                return (
                  <div
                    key={row.id}
                    style={{
                      display: "flex",
                      gap: 14,
                      alignItems: "baseline",
                      borderTop: "1px solid hsl(40 20% 97% / 0.06)",
                      paddingTop: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ color: TONE_COLOR[meta.tone], fontSize: 17, minWidth: 130 }}>
                      {meta.label}
                    </span>
                    <span style={{ color: BRIGHT, fontSize: 17, minWidth: 200 }}>
                      {projectName(row.client_project_id)}
                    </span>
                    <span style={{ color: MUTED, fontSize: 16, minWidth: 110 }}>{ago(row.fired_at)}</span>
                    {row.detail && (
                      <span style={{ color: MUTED, fontSize: 16, flex: 1, minWidth: 240 }}>
                        {row.detail}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: Tone }) {
  return (
    <div>
      <span style={{ fontSize: 26, color: n === 0 ? MUTED : TONE_COLOR[tone] }}>{n}</span>{" "}
      <span style={{ fontSize: 16, color: MUTED }}>{label}</span>
    </div>
  );
}
