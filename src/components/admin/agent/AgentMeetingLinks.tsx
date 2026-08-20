// Booking links an agent can offer, one per kind of conversation.
//
// There was a single `meeting_link`, which meant every agent's every context —
// a proposal question, a discovery call, a check-in — had to route through one
// URL. The key now names what the meeting is for, so a new purpose is a new
// key rather than a schema change.
//
// Any config key ending in `_meeting_link` shows up here. That convention is
// what lets an agent hold links this component has never heard of.
import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, type Agent } from "@/lib/agentsApi";

const SUFFIX = "_meeting_link";

/** "proposal_meeting_link" -> "Proposal" */
function linkPurpose(key: string): string {
  const stem = key.slice(0, -SUFFIX.length).replace(/_/g, " ").trim();
  return stem ? stem.charAt(0).toUpperCase() + stem.slice(1) : "Meeting";
}

/** "Discovery call" -> "discovery_call_meeting_link" */
function keyFor(purpose: string): string {
  const slug = purpose.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${slug || "meeting"}${SUFFIX}`;
}

export default function AgentMeetingLinks({ agent, onChanged }: {
  agent: Agent;
  onChanged: () => void;
}) {
  const config = (agent.config ?? {}) as Record<string, unknown>;
  const links = Object.keys(config)
    .filter((k) => k.endsWith(SUFFIX))
    .sort();

  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const write = async (next: Record<string, unknown>, note: string) => {
    setSaving(true);
    const { error } = await supabase.from("agents")
      .update({ config: next as never }).eq("id", agent.id);
    setSaving(false);
    if (error) return toast.error(errMsg(error) || "Could not save");
    toast.success(note);
    onChanged();
  };

  const save = async (key: string) => {
    const value = (drafts[key] ?? "").trim();
    if (value && !/^https?:\/\//i.test(value)) {
      // A booking link that isn't a URL fails silently inside an email, which
      // is the worst place to find out.
      return toast.error("That needs to be a full URL, starting with https://");
    }
    await write({ ...config, [key]: value }, `${linkPurpose(key)} link saved`);
    setDrafts((d) => { const n = { ...d }; delete n[key]; return n; });
  };

  const remove = async (key: string) => {
    if (!confirm(`Remove the ${linkPurpose(key).toLowerCase()} link?`)) return;
    const next = { ...config };
    delete next[key];
    await write(next, "Link removed");
  };

  const add = async () => {
    if (!purpose.trim()) return toast.error("Name what the meeting is for");
    const key = keyFor(purpose);
    if (key in config) return toast.error("There is already a link for that");
    await write({ ...config, [key]: "" }, "Link added");
    setPurpose("");
    setAdding(false);
  };

  return (
    <div className="ws__sec">
      <h2 className="ws__sec-title">
        Meeting links
        <button className="ws__rule-add" onClick={() => setAdding((a) => !a)}>
          <Plus size={13} /> Add
        </button>
      </h2>
      <p className="ws__sec-blurb">
        Booking links {agent.name} can offer, one per kind of conversation. She only ever
        sends a link that is filled in here — she will not invent one.
      </p>

      <div className="ws__links">
        {links.map((key) => {
          const current = String(config[key] ?? "");
          const draft = drafts[key];
          const dirty = draft !== undefined && draft !== current;
          return (
            <div key={key} className="ws__link">
              <div className="ws__link-head">
                <span className="ws__link-purpose">{linkPurpose(key)}</span>
                <button className="ws__link-del" onClick={() => void remove(key)}
                  title="Remove" aria-label={`Remove the ${linkPurpose(key)} link`}>
                  <Trash2 size={13} />
                </button>
              </div>
              <input className="crm-input" value={draft ?? current}
                placeholder="https://…" spellCheck={false}
                aria-label={`${linkPurpose(key)} booking URL`}
                onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))} />
              {dirty && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="crm-btn" style={{ fontSize: 13 }}
                    disabled={saving} onClick={() => void save(key)}>Save</button>
                  <button className="crm-btn crm-btn--ghost" style={{ fontSize: 13 }}
                    onClick={() => setDrafts((d) => { const n = { ...d }; delete n[key]; return n; })}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {!links.length && (
          <p className="ws__rule-empty">No meeting links yet.</p>
        )}
      </div>

      {adding && (
        <div className="ws__rule-form">
          <input className="crm-input" value={purpose} maxLength={40}
            placeholder="What is the meeting for? e.g. Discovery call"
            onChange={(e) => setPurpose(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="crm-btn" disabled={saving} onClick={() => void add()}>
              Add link
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
