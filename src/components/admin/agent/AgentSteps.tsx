// What the agent is doing, while it does it.
//
// A turn that reads three records and runs a web search takes a couple of
// minutes, and a spinner for two minutes is indistinguishable from a hang. The
// steps are also the honest record of what data a reply was actually built on,
// which is worth keeping after the fact — collapsed, so the transcript does not
// turn into a log.
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export type AgentStep = {
  id: string;
  message_id: string;
  seq: number;
  kind: "thinking" | "tool" | "action" | "note";
  tool_name: string | null;
  label: string;
  status: "running" | "ok" | "error";
};

const DOT: Record<AgentStep["status"], string> = {
  running: "var(--crm-bronze, #8a7355)",
  ok: "#9db8a6",
  error: "#e07a5f",
};

export default function AgentSteps({ steps, live }: {
  steps: AgentStep[];
  /** True while the turn is still running — the list stays open. */
  live: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;

  if (live) {
    // Newest last, and only the tail: a long turn should read as progress, not
    // as a wall of everything it has ever done.
    const tail = steps.slice(-6);
    return (
      <div className="ws__steps ws__steps--live">
        {tail.map((s) => (
          <div key={s.id} className={`ws__step ws__step--${s.status}`}>
            <span className="ws__step-dot" style={{ background: DOT[s.status] }} />
            <span className="ws__step-label">{s.label}</span>
          </div>
        ))}
      </div>
    );
  }

  const tools = steps.filter((s) => s.kind === "tool").length;
  return (
    <div className="ws__steps">
      <button className="ws__steps-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {tools > 0
          ? `${tools} lookup${tools === 1 ? "" : "s"}`
          : `${steps.length} step${steps.length === 1 ? "" : "s"}`}
      </button>
      {open && steps.map((s) => (
        <div key={s.id} className={`ws__step ws__step--${s.status}`}>
          <span className="ws__step-dot" style={{ background: DOT[s.status] }} />
          <span className="ws__step-label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}
