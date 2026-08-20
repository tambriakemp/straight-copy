// Right rail: what this agent is doing and has done.
//
// Counts are derived from the runs already loaded rather than fetched
// separately — one query, and the chips can never disagree with the list
// beneath them.
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

export interface ActivityRun {
  id: string;
  status: "running" | "succeeded" | "failed" | "skipped";
  trigger: string;
  headline: string | null;
  started_at: string;
}

const DOT: Record<string, string> = {
  running: "#dbb172", succeeded: "#9db8a6", failed: "#e07a5f", skipped: "var(--crm-taupe)",
};

function dayLabel(iso: string): string {
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return new Date(iso).toLocaleDateString(undefined, { weekday: "long" });
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AgentActivityPanel({ runs }: { runs: ActivityRun[] }) {
  const navigate = useNavigate();

  const counts = useMemo(() => {
    const dayAgo = Date.now() - 86400000;
    return {
      running: runs.filter((r) => r.status === "running").length,
      paused: runs.filter((r) => r.status === "skipped").length,
      done: runs.filter((r) => r.status === "succeeded").length,
      // Failures only alarm while they are fresh, hence the window.
      failed24: runs.filter(
        (r) => r.status === "failed" && new Date(r.started_at).getTime() >= dayAgo,
      ).length,
    };
  }, [runs]);

  const groups: Array<{ label: string; items: ActivityRun[] }> = [];
  for (const r of runs) {
    const label = dayLabel(r.started_at);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(r);
    else groups.push({ label, items: [r] });
  }

  return (
    <aside className="ws__activity">
      <div className="ws__activity-head">
        <span className="ws__activity-title">▤ Activity</span>
        <span className="ws__chips">
          <span className="ws__chip"><i style={{ background: DOT.running }} />{counts.running} Running</span>
          <span className="ws__chip"><i style={{ background: DOT.skipped }} />{counts.paused} Paused</span>
          <span className="ws__chip"><i style={{ background: DOT.succeeded }} />{counts.done} Done</span>
          <span className="ws__chip"><i style={{ background: DOT.failed }} />{counts.failed24} Failed · 24h</span>
        </span>
      </div>

      <div className="ws__activity-body">
        {!runs.length ? (
          <div className="ws__empty">No activity yet.</div>
        ) : (
          groups.map((g) => (
            <div key={g.label}>
              <div className="ws__activity-day">{g.label}</div>
              {g.items.map((r) => (
                <button key={r.id} className="ws__activity-row"
                  onClick={() => navigate(`/admin/agents/runs/${r.id}`)}>
                  <span className="ws__activity-dot" style={{ color: DOT[r.status] }}>●</span>
                  <span className="ws__activity-what">
                    {r.headline ?? (r.status === "failed" ? "Run failed" : "Run")}
                  </span>
                  <span className="ws__activity-time">
                    {new Date(r.started_at).toLocaleTimeString(undefined,
                      { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
