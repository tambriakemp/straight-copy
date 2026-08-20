// Middle pane, "Agent" view: everything that configures this agent.
//
// Same settings the standalone page had, laid out as sections in the workspace
// so changing how an agent behaves does not mean leaving the place you talk
// to it.
import { useRef, useState } from "react";
import { toast } from "sonner";
import AgentAvatar from "@/components/admin/AgentAvatar";
import AgentRulesPanel from "@/components/admin/agent/AgentRulesPanel";
import AgentMeetingLinks from "@/components/admin/agent/AgentMeetingLinks";
import { supabase } from "@/integrations/supabase/client";
import {
  errMsg, uploadAgentAvatar, removeAgentAvatar,
  AUTONOMY_LABEL, AUTONOMY_BLURB, describeCron,
  type Agent, type Autonomy,
} from "@/lib/agentsApi";

const AUTONOMY_ORDER: Autonomy[] = ["propose", "act_in_app", "autonomous"];

const CHANNELS = [
  { key: "in_app", label: "In-app", blurb: "Always on. The run and the activity feed.", locked: true },
  { key: "email", label: "Email", blurb: "Sends the brief to your inbox." },
  { key: "tasks", label: "Tasks", blurb: "Findings become real tasks on the board." },
  { key: "push", label: "Push", blurb: "Only fires when something needs approval." },
];

const SCHEDULES: Array<{ label: string; cron: string | null }> = [
  { label: "Manual only", cron: null },
  { label: "Daily, 13:00 UTC", cron: "0 13 * * *" },
  { label: "Weekdays, 11:00 UTC", cron: "0 11 * * 1-5" },
  { label: "Weekdays, 12:00 UTC", cron: "0 12 * * 1-5" },
  { label: "Mondays, 12:00 UTC", cron: "0 12 * * 1" },
  { label: "Every 6 hours", cron: "0 */6 * * *" },
];

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];

export default function AgentSettingsPanel({ agent, onChanged }: {
  agent: Agent;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [prompt, setPrompt] = useState(agent.system_prompt ?? "");
  const [name, setName] = useState(agent.name);
  const [role, setRole] = useState(agent.role);
  const avatarRef = useRef<HTMLInputElement>(null);

  /**
   * Settings write straight to the table rather than through agents-api.
   *
   * The admin RLS policy already allows exactly this, and going direct means
   * changing a setting cannot fail because an edge function has not been
   * deployed — which is how these controls silently stopped working before.
   */
  const patch = async (body: Record<string, unknown>, note?: string) => {
    setSaving(true);
    try {
      const { error } = await supabase.from("agents")
        // The generated Update type rejects a plain record; every caller below
        // passes real agent columns, so the cast is the narrow lie, not a hole.
        .update(body as never).eq("id", agent.id);
      if (error) throw new Error(error.message);
      if (note) toast.success(note);
      onChanged();
    } catch (e) {
      toast.error(errMsg(e) || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const renameDirty = name.trim() !== agent.name || role.trim() !== agent.role;

  const delivery = agent.delivery ?? {};

  return (
    <section className="ws__settings">
      <div className="ws__settings-inner">

        {/* ---------- identity ---------- */}
        <div className="ws__sec">
          <h2 className="ws__sec-title">Identity</h2>
          <div className="ws__panel" style={{ display: "flex", gap: 18, alignItems: "center", padding: 18 }}>
            <AgentAvatar name={agent.name} url={agent.avatar_url}
              accent={agent.accent_color} size={92} />
            <div style={{ display: "grid", gap: 8, flex: 1, minWidth: 0 }}>
              <input className="crm-input"
                style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 28, padding: "4px 8px" }}
                value={name} maxLength={40} aria-label="Agent name"
                onChange={(e) => setName(e.target.value)} />
              <input className="crm-input"
                style={{ fontSize: 13, letterSpacing: "0.24em", textTransform: "uppercase", padding: "4px 8px" }}
                value={role} maxLength={60} aria-label="Agent role"
                onChange={(e) => setRole(e.target.value)} />
              {renameDirty && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="crm-btn" style={{ fontSize: 13 }} disabled={saving || !name.trim()}
                    onClick={() => patch(
                      { name: name.trim(), role: role.trim() || agent.role },
                      `Renamed to ${name.trim()}`,
                    )}>
                    Save name
                  </button>
                  <button className="crm-btn crm-btn--ghost" style={{ fontSize: 13 }}
                    onClick={() => { setName(agent.name); setRole(agent.role); }}>
                    Cancel
                  </button>
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <input ref={avatarRef} type="file" accept="image/*" hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    try {
                      await uploadAgentAvatar(agent.id, file);
                      toast.success("Portrait updated");
                      onChanged();
                    } catch (err) {
                      toast.error(errMsg(err) || "Could not upload that image");
                    } finally {
                      setUploading(false);
                      if (avatarRef.current) avatarRef.current.value = "";
                    }
                  }} />
                <button className="crm-btn crm-btn--ghost" style={{ fontSize: 13 }}
                  disabled={uploading} onClick={() => avatarRef.current?.click()}>
                  {uploading ? "…" : agent.avatar_url ? "Replace photo" : "Add photo"}
                </button>
                {agent.avatar_url && (
                  <button className="crm-btn crm-btn--ghost" style={{ fontSize: 13 }}
                    onClick={async () => {
                      await removeAgentAvatar(agent.id);
                      toast.success("Portrait removed");
                      onChanged();
                    }}>Remove</button>
                )}
                <button className="crm-btn crm-btn--ghost" style={{ fontSize: 13 }}
                  onClick={() => patch({ enabled: !agent.enabled }, agent.enabled ? "Paused" : "Resumed")}>
                  {agent.enabled ? "Pause agent" : "Resume agent"}
                </button>
              </div>
            </div>
          </div>
          {agent.description && (
            <p style={{ fontSize: 15, color: "var(--crm-taupe)", margin: "10px 2px 0", lineHeight: 1.6 }}>
              {agent.description}
            </p>
          )}
        </div>

        {/* ---------- standing rules ---------- */}
        <AgentRulesPanel agent={agent} />

        {/* ---------- meeting links ---------- */}
        <AgentMeetingLinks agent={agent} onChanged={onChanged} />

        {/* ---------- autonomy ---------- */}
        <div className="ws__sec">
          <h2 className="ws__sec-title">How much rope</h2>
          <div className="ws__panel" style={{ padding: 14, display: "grid", gap: 10 }}>
            {AUTONOMY_ORDER.map((level) => (
              <button key={level} disabled={saving}
                onClick={() => patch({ autonomy: level }, `${agent.name} now ${AUTONOMY_LABEL[level].toLowerCase()}`)}
                className={`ws__opt ${agent.autonomy === level ? "ws__opt--on" : ""}`}>
                <span style={{ color: agent.autonomy === level ? "#9db8a6" : "var(--crm-taupe)" }}>
                  {agent.autonomy === level ? "●" : "○"}
                </span>
                <span>
                  <span style={{ fontSize: 16 }}>{AUTONOMY_LABEL[level]}</span>
                  <span style={{ display: "block", fontSize: 14, color: "var(--crm-taupe)", marginTop: 3 }}>
                    {AUTONOMY_BLURB[level]}
                  </span>
                </span>
              </button>
            ))}
            {agent.autonomy === "autonomous" && (
              <p style={{ fontSize: 14, color: "#dbb172", margin: 0 }}>
                This agent can now email real people without you reading the draft first.
              </p>
            )}
          </div>
        </div>

        {/* ---------- routine ---------- */}
        <div className="ws__sec">
          <h2 className="ws__sec-title">Routine</h2>
          <div className="ws__panel" style={{ padding: 14, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {SCHEDULES.map((s) => (
                <button key={s.label} disabled={saving}
                  onClick={() => patch({ schedule_cron: s.cron }, "Schedule updated")}
                  className={`ws__pill ${agent.schedule_cron === s.cron ? "ws__pill--on" : ""}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 14, color: "var(--crm-taupe)" }}>
              Currently: {describeCron(agent.schedule_cron)}
              {agent.next_run_at && ` · next ${new Date(agent.next_run_at).toLocaleString()}`}
            </div>
            <p style={{ fontSize: 13, color: "var(--crm-taupe)", margin: 0, fontStyle: "italic" }}>
              The dispatcher wakes every 15 minutes, so a run starts within 15 minutes of its time.
            </p>
          </div>
        </div>

        {/* ---------- delivery ---------- */}
        <div className="ws__sec">
          <h2 className="ws__sec-title">Where its output goes</h2>
          <div className="ws__panel" style={{ padding: 14, display: "grid", gap: 8 }}>
            {CHANNELS.map((c) => {
              const on = c.locked ? true : !!delivery[c.key];
              return (
                <button key={c.key} disabled={saving || c.locked}
                  onClick={() => patch({ delivery: { ...delivery, [c.key]: !on } })}
                  className="ws__opt" style={{ opacity: c.locked ? 0.7 : 1 }}>
                  <span style={{ color: on ? "#9db8a6" : "var(--crm-taupe)" }}>{on ? "●" : "○"}</span>
                  <span>
                    <span style={{ fontSize: 15 }}>{c.label}</span>
                    <span style={{ display: "block", fontSize: 13, color: "var(--crm-taupe)", marginTop: 2 }}>
                      {c.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ---------- engine ---------- */}
        <div className="ws__sec">
          <h2 className="ws__sec-title">Engine</h2>
          <div className="ws__panel" style={{ padding: 14, display: "grid", gap: 12 }}>
            <div>
              <label className="crm-label">Reasoning effort</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                {EFFORTS.map((e) => (
                  <button key={e} disabled={saving}
                    onClick={() => patch({ effort: e }, `Effort set to ${e}`)}
                    className={`ws__pill ${agent.effort === e ? "ws__pill--on" : ""}`}>
                    {e}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 13, color: "var(--crm-taupe)", marginTop: 8, fontStyle: "italic" }}>
                Higher effort means deeper reasoning and more tokens. High suits most work;
                drop to low for simple sweeps.
              </p>
            </div>
            <div style={{ fontSize: 14, color: "var(--crm-taupe)" }}>
              Model: <code>{agent.model}</code>
            </div>
          </div>
        </div>

        {/* ---------- brief ---------- */}
        <div className="ws__sec">
          <h2 className="ws__sec-title">Its brief</h2>
          <div className="ws__panel" style={{ padding: 14, display: "grid", gap: 10 }}>
            <p style={{ fontSize: 14, color: "var(--crm-taupe)", margin: 0 }}>
              Leave empty to use the built-in brief for this role. Anything here replaces it — the
              shared house rules about tone and how money is counted always still apply.
            </p>
            <textarea className="crm-input" rows={10} value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Override this agent's mission…"
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, lineHeight: 1.6 }} />
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
        </div>

      </div>
    </section>
  );
}
