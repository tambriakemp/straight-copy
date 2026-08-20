// Standing rules: the things that are always true, so nobody has to say them
// again.
//
// These could have lived in the free-text brief below, but a blob is not a
// thing you can pause. A rule you can switch off for one week and back on is
// a rule you will actually keep current, and one you can point at when the
// agent does something you did not expect.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pause, Play, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, type Agent } from "@/lib/agentsApi";

type Rule = {
  id: string;
  agent_id: string | null;
  scope: string;
  label: string;
  body: string;
  category: string;
  enabled: boolean;
  order_index: number;
};

const CATEGORIES = ["general", "terms", "pricing", "process", "voice"];

export default function AgentRulesPanel({ agent }: { agent: Agent }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("agent_rules")
      .select("id, agent_id, scope, label, body, category, enabled, order_index")
      .or(`scope.eq.all,agent_id.eq.${agent.id}`)
      .order("order_index", { ascending: true });
    if (error) toast.error(error.message);
    setRules((data ?? []) as Rule[]);
    setLoading(false);
  }, [agent.id]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!label.trim() || !body.trim()) return toast.error("A rule needs a name and a rule");
    setSaving(true);
    const { error } = await supabase.from("agent_rules").insert({
      agent_id: agent.id,
      scope: "agent",
      label: label.trim(),
      body: body.trim(),
      category,
      // New rules go last, so the seeded ones keep the order they were written in.
      order_index: (rules.at(-1)?.order_index ?? 0) + 10,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    setLabel(""); setBody(""); setCategory("general"); setAdding(false);
    toast.success("Rule added");
    void load();
  };

  const toggle = async (r: Rule) => {
    const { error } = await supabase.from("agent_rules")
      .update({ enabled: !r.enabled }).eq("id", r.id);
    if (error) return toast.error(errMsg(error) || "Could not save");
    void load();
  };

  const remove = async (r: Rule) => {
    if (!confirm(`Delete the rule "${r.label}"?`)) return;
    const { error } = await supabase.from("agent_rules").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    void load();
  };

  return (
    <div className="ws__sec">
      <h2 className="ws__sec-title">
        Rules
        <button className="ws__rule-add" onClick={() => setAdding((a) => !a)}>
          <Plus size={13} /> Add
        </button>
      </h2>
      <p className="ws__sec-blurb">
        Settled facts {agent.name} reads before every run and every message. Anything in
        here is something she will never ask you about.
      </p>

      {loading ? (
        <p className="ws__rule-empty">Loading…</p>
      ) : (
        <div className="ws__rules">
          {rules.map((r) => (
            <div key={r.id} className={`ws__rule${r.enabled ? "" : " ws__rule--off"}`}>
              <div className="ws__rule-text">
                <div className="ws__rule-label">
                  {r.label}
                  {r.scope === "all" && <span className="ws__rule-tag">all agents</span>}
                  <span className="ws__rule-tag">{r.category}</span>
                </div>
                <div className="ws__rule-body">{r.body}</div>
              </div>
              <div className="ws__rule-controls">
                <button onClick={() => toggle(r)}
                  title={r.enabled ? "Pause this rule" : "Resume this rule"}
                  aria-label={r.enabled ? "Pause this rule" : "Resume this rule"}>
                  {r.enabled ? <Pause size={14} /> : <Play size={14} />}
                </button>
                <button onClick={() => remove(r)} title="Delete" aria-label="Delete this rule">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {!rules.length && (
            <p className="ws__rule-empty">
              No rules yet. Add the things you would otherwise repeat every time.
            </p>
          )}
        </div>
      )}

      {adding && (
        <div className="ws__rule-form">
          <div className="ws__rule-cats">
            {CATEGORIES.map((c) => (
              <button key={c}
                className={`ws__rule-cat${category === c ? " ws__rule-cat--on" : ""}`}
                onClick={() => setCategory(c)}>{c}</button>
            ))}
          </div>
          <input className="crm-input" value={label} maxLength={60}
            placeholder="Name it — e.g. Governing law"
            onChange={(e) => setLabel(e.target.value)} />
          <textarea className="crm-input" rows={3} value={body} maxLength={600}
            placeholder="The rule itself — e.g. Governing law is Georgia unless the client is outside the US."
            onChange={(e) => setBody(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="crm-btn" disabled={saving} onClick={add}>
              {saving ? "Saving…" : "Save rule"}
            </button>
            <button className="crm-btn crm-btn--ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
