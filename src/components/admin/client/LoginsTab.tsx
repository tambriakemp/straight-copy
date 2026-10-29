// The client page's Logins tab, laid out to the Admin Journeys canvas:
// one row per account, password masked until you ask for it.
//
// Passwords are encrypted at rest (pgp_sym_encrypt) and never come down
// with the list. The list reads client_logins_list, a view that carries
// everything EXCEPT the ciphertext — the SELECT privilege on that column
// is revoked from `authenticated`, so even a hand-rolled request for it is
// refused. Show and Copy go through the client-logins edge function, which
// is the only thing holding the key.
//
// Reveal is per row and resets on reload. There is no "show all": these
// sit on a screen that gets shared and screenshotted, and the whole point
// of the dots is that they are the default.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Lock, Globe, Mail, CreditCard, GripVertical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import EmptyState from "@/components/admin/cv/EmptyState";
import SidePanel from "@/components/admin/SidePanel";
import {
  MASK, subtitleFor, hrefFor, passwordToSend, shareBody, loginProjectLabel,
  type ClientLoginRow,
} from "@/lib/clientLogins";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

// The tinted square, picked off the label so a row is recognisable before
// it is read. Cosmetic only — nothing depends on getting it right.
const ICONS: Array<{ test: RegExp; icon: typeof KeyRound; bg: string; fg: string }> = [
  { test: /mail|inbox|smtp/i, icon: Mail, bg: "#FFF1E3", fg: "#A8440A" },
  { test: /bank|stripe|pay|billing|invoice/i, icon: CreditCard, bg: "#E5F6EC", fg: "#17703D" },
  { test: /site|web|host|domain|dns|wordpress|portal/i, icon: Globe, bg: "#E7EEFF", fg: "#2447C0" },
];
function iconFor(label: string) {
  return ICONS.find((i) => i.test.test(label)) ?? { icon: Lock, bg: "#F3E8FF", fg: "#6B2FB8" };
}

async function call(action: string, body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not signed in");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/client-logins`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? res.statusText);
  return json as Record<string, unknown>;
}

interface Draft {
  id: string | null; label: string; url: string; username: string;
  password: string; note: string; projectId: string;
}
const BLANK: Draft = {
  id: null, label: "", url: "", username: "", password: "", note: "", projectId: "",
};

export interface LoginProjectOption {
  id: string;
  name: string;
  status?: string;
}

export default function LoginsTab({
  clientId, clientName, clientEmail, logins, projects = [], onChanged,
}: {
  clientId: string;
  clientName: string;
  clientEmail: string | null;
  logins: ClientLoginRow[];
  /** This client's projects, for the optional field on the form and the
   *  chip on a row that has one. */
  projects?: LoginProjectOption[];
  onChanged: () => void;
}) {
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  // Local copy of the order while dragging; null means "use the prop".
  const [ordered, setOrdered] = useState<ClientLoginRow[] | null>(null);
  const dragId = useRef<string | null>(null);
  const rows = ordered ?? logins;
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const projectLabel = (l: ClientLoginRow) => loginProjectLabel(l, projectNames);

  const reveal = async (id: string) => {
    if (revealed[id] !== undefined) { // already showing — hide again
      setRevealed(({ [id]: _drop, ...rest }) => rest);
      return;
    }
    setBusy(id);
    try {
      const out = await call("reveal", { id });
      const pw = (out.password as string | null) ?? "";
      if (!pw) { toast("No password saved for this login."); return; }
      setRevealed((r) => ({ ...r, [id]: pw }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that password");
    } finally {
      setBusy(null);
    }
  };

  const copy = async (id: string) => {
    setBusy(id);
    try {
      // Fetched fresh rather than read off `revealed`, so Copy works
      // without showing the password on a screen someone may be sharing.
      const out = await call("reveal", { id });
      const pw = (out.password as string | null) ?? "";
      if (!pw) { toast("No password saved for this login."); return; }
      await navigator.clipboard.writeText(pw);
      toast.success("Password copied");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not copy that password");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.label.trim()) { toast.error("Give the login a name"); return; }
    setSaving(true);
    try {
      await call("upsert", {
        client_id: clientId,
        id: draft.id,
        label: draft.label.trim(),
        url: draft.url.trim() || null,
        username: draft.username.trim() || null,
        password: passwordToSend(draft.password, draft.id !== null),
        note: draft.note.trim() || null,
        // Blank is a login with no project. The portal still lists it;
        // it just has no project heading.
        client_project_id: draft.projectId || null,
      });
      toast.success(draft.id ? "Login updated" : "Login added");
      setDraft(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that login");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string, label: string) => {
    if (!confirm(`Delete the login "${label}"? This cannot be undone.`)) return;
    try {
      await call("delete", { id, client_id: clientId });
      toast.success("Login deleted");
      setDraft(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete that login");
    }
  };

  // Drag-to-reorder: move the dragged row under the pointer's row, then
  // persist the whole order in one call. A failed save reloads from the
  // server, so a half-saved order never lingers on screen.
  const dropOn = async (targetId: string) => {
    const from = dragId.current;
    dragId.current = null;
    if (!from || from === targetId) return;
    const list = [...rows];
    const a = list.findIndex((l) => l.id === from);
    const b = list.findIndex((l) => l.id === targetId);
    if (a < 0 || b < 0) return;
    const [moved] = list.splice(a, 1);
    list.splice(b, 0, moved);
    setOrdered(list);
    try {
      await call("reorder", { client_id: clientId, ids: list.map((l) => l.id) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that order");
    } finally {
      setOrdered(null);
      onChanged();
    }
  };

  const sendAll = () => {
    if (!logins.length) { toast.error("Nothing to send yet"); return; }
    const body = shareBody(clientName, logins);
    const to = clientEmail ?? "";
    window.location.href =
      `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent("Your account logins")}&body=${encodeURIComponent(body)}`;
  };

  return (
    <>
      <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <div style={{ flex: "1 1 240px" }}>
            <h2 className="cv-card-title">Logins</h2>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--cv-muted)" }}>
              Account logins for this client. Passwords stay hidden until you
              click Show. Only you can see this tab; the client can't.
            </p>
          </div>
          <button type="button" className="cv-open" style={{ padding: "0 20px" }} onClick={sendAll}>
            Send all to client
          </button>
          <button
            type="button" className="cv-open cv-open--dark" style={{ padding: "0 20px" }}
            onClick={() => setDraft({ ...BLANK })}
          >
            + Add login
          </button>
        </div>

        {!rows.length ? (
          <EmptyState title="No logins saved" subtitle="Add the accounts you hold for this client." />
        ) : rows.map((l) => {
          const { icon: Icon, bg, fg } = iconFor(l.label);
          const shown = revealed[l.id];
          const sub = subtitleFor(l);
          const href = hrefFor(l.url);
          return (
            <div
              key={l.id} className="cv-lg"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dropOn(l.id)}
            >
              <span
                draggable
                onDragStart={() => { dragId.current = l.id; }}
                title="Drag to reorder"
                style={{ cursor: "grab", color: "var(--cv-muted)", display: "flex", alignItems: "center", touchAction: "none" }}
              >
                <GripVertical size={18} />
              </span>
              <span className="cv-ic" style={{ background: bg, color: fg }}><Icon size={22} /></span>
              <span className="cv-lg__who">
                <b>{l.label}</b>
                {sub && (
                  <small>
                    {href
                      ? <a href={href} target="_blank" rel="noreferrer">{sub}</a>
                      : sub}
                  </small>
                )}
              </span>
              {/* Which project the client shared it for. Absent on the
                  logins we hold for the client as a whole — a chip
                  reading "General" on most rows is noise. */}
              {projectLabel(l) && (
                <span className="cv-chip cv-chip--blue">{projectLabel(l)}</span>
              )}
              <span className="cv-lg__pw">{shown ?? (l.has_password ? MASK : "No password")}</span>
              <span className="cv-lg__bt">
                <button
                  type="button" className="cv-mini"
                  disabled={!l.has_password || busy === l.id}
                  onClick={() => reveal(l.id)}
                >
                  {shown ? "Hide" : "Show"}
                </button>
                <button
                  type="button" className="cv-mini"
                  disabled={!l.has_password || busy === l.id}
                  onClick={() => copy(l.id)}
                >
                  Copy
                </button>
                <button
                  type="button" className="cv-mini"
                  onClick={() => setDraft({
                    id: l.id, label: l.label, url: l.url ?? "",
                    username: l.username ?? "", password: "", note: l.note ?? "",
                    projectId: l.client_project_id ?? "",
                  })}
                >
                  Edit
                </button>
              </span>
            </div>
          );
        })}
      </section>

      <SidePanel
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Edit login" : "Add login"}
        subtitle={clientName}
        width={480}
      >
        {draft && (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <label className="cv-field">
              Name
              <input
                className="cv-input" value={draft.label} autoFocus
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="Menovia Health admin portal"
              />
            </label>
            <label className="cv-field">
              Project
              <select
                className="cv-select" value={draft.projectId}
                onChange={(e) => setDraft({ ...draft, projectId: e.target.value })}
              >
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.status === "archived" ? `${project.name} (archived)` : project.name}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 12 }}>
                Optional. Leave this blank for a login that is not for one project.
              </span>
            </label>
            <label className="cv-field">
              Sign-in link
              <input
                className="cv-input" value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                placeholder="https://admin.example.com"
              />
            </label>
            <label className="cv-field">
              Username
              <input
                className="cv-input" value={draft.username}
                onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                placeholder="bree@cre8visions.com"
              />
            </label>
            <label className="cv-field">
              Password
              <input
                className="cv-input" type="password" value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                placeholder={draft.id ? "Leave blank to keep the current one" : ""}
              />
            </label>
            <label className="cv-field">
              Note
              <textarea
                className="cv-textarea" rows={3} value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="Anything worth remembering about this account"
              />
            </label>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 22px" }} onClick={save} disabled={saving}>
                {saving ? "Saving…" : draft.id ? "Save changes" : "Add login"}
              </button>
              <button type="button" className="cv-open" style={{ padding: "0 22px" }} onClick={() => setDraft(null)}>
                Cancel
              </button>
              {draft.id && (
                <button
                  type="button" className="cv-mini cv-mini--danger" style={{ marginLeft: "auto" }}
                  onClick={() => remove(draft.id!, draft.label)}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </SidePanel>
    </>
  );
}
