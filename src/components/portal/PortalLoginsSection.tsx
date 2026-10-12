// The Logins tab on a client's project, in the portal.
//
// The same panel the admin has — one row per account, a tinted square,
// the password masked — with one deliberate difference: there is no
// Show. A portal URL is a link, not a sign-in, and a link that reads
// back the client's own third-party passwords turns one forwarded email
// into a credential dump. The client can replace a password they got
// wrong; they cannot ask us to read one back to them. The admin side,
// which is behind a login, still reveals.
//
// Everything here is scoped to ONE project, server-side. A login the
// agency holds for the client as a whole has no project on it and is
// unreachable from the portal at all.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Lock, Globe, Mail, CreditCard } from "lucide-react";
import EmptyState from "@/components/admin/cv/EmptyState";
import { MASK, subtitleFor, hrefFor, passwordToSend, type ClientLoginRow } from "@/lib/clientLogins";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const ICONS: Array<{ test: RegExp; icon: typeof KeyRound; bg: string; fg: string }> = [
  { test: /mail|inbox|smtp/i, icon: Mail, bg: "#FFF1E3", fg: "#A8440A" },
  { test: /bank|stripe|pay|billing|invoice/i, icon: CreditCard, bg: "#E5F6EC", fg: "#17703D" },
  { test: /site|web|host|domain|dns|wordpress|portal|registrar/i, icon: Globe, bg: "#E7EEFF", fg: "#2447C0" },
];
function iconFor(label: string) {
  return ICONS.find((i) => i.test.test(label)) ?? { icon: Lock, bg: "#F3E8FF", fg: "#6B2FB8" };
}

async function call(action: string, body: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/client-logins`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PUB_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string })?.error ?? res.statusText);
  return json as Record<string, unknown>;
}

interface Draft { id: string | null; label: string; url: string; username: string; password: string; note: string }
const BLANK: Draft = { id: null, label: "", url: "", username: "", password: "", note: "" };

export default function PortalLoginsSection({
  clientId, clientProjectId,
}: {
  clientId: string;
  clientProjectId: string;
}) {
  const [logins, setLogins] = useState<ClientLoginRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    try {
      const out = await call("portal_list", { client_id: clientId, client_project_id: clientProjectId });
      setLogins((out.logins ?? []) as ClientLoginRow[]);
      setUnavailable(false);
    } catch {
      // Until the function carrying portal_list is deployed this tab has
      // nothing to read. It says so rather than reading as "you have
      // shared nothing", which is a different and wrong statement.
      setLogins([]);
      setUnavailable(true);
    }
  }, [clientId, clientProjectId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft) return;
    if (!draft.label.trim()) { toast.error("Give the login a name"); return; }
    setSaving(true);
    try {
      await call("portal_upsert", {
        client_id: clientId,
        client_project_id: clientProjectId,
        id: draft.id,
        label: draft.label.trim(),
        url: draft.url.trim() || null,
        username: draft.username.trim() || null,
        password: passwordToSend(draft.password, draft.id !== null),
        note: draft.note.trim() || null,
      });
      toast.success(draft.id ? "Login updated" : "Login shared with Cre8 Visions");
      setDraft(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that login");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string, label: string) => {
    if (!confirm(`Remove the login "${label}"? Cre8 Visions will no longer have it.`)) return;
    try {
      await call("portal_delete", { client_id: clientId, client_project_id: clientProjectId, id });
      toast.success("Login removed");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove that login");
    }
  };

  const rows = logins ?? [];

  return (
    <div className="cv-pg">
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <div style={{ flex: "1 1 300px" }}>
          <h2 className="cv-card-title" style={{ fontSize: 22 }}>Logins</h2>
          <p className="cv-page-sub">
            Share the account logins Cre8 Visions needs for this project, such as
            your domain, hosting or app store accounts. Only you and the Cre8
            Visions team can see them.
          </p>
        </div>
        <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 20px" }}
          onClick={() => setDraft({ ...BLANK })}>
          + Add a login
        </button>
      </div>

      {unavailable && (
        <section className="cv-card cv-card-pad">
          <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
            This isn't switched on yet. Cre8 Visions will let you know when you
            can share logins here — in the meantime, reply to our last email.
          </p>
        </section>
      )}

      {draft && (
        <form className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}
          onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <h2 className="cv-card-title">{draft.id ? "Edit login" : "New login"}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label className="cv-field">
              What is this account?
              <input className="cv-input" value={draft.label} autoFocus
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="e.g. GoDaddy, hosting, Google Analytics" />
            </label>
            <label className="cv-field">
              Sign-in link
              <input className="cv-input" type="url" value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                placeholder="https://" />
            </label>
            <label className="cv-field">
              Username or email
              <input className="cv-input" autoComplete="off" value={draft.username}
                onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
            </label>
            <label className="cv-field">
              Password
              <input className="cv-input" type="password" autoComplete="new-password" value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                placeholder={draft.id ? "Leave blank to keep the current one" : ""} />
            </label>
          </div>
          <label className="cv-field">
            Anything we should know? (optional)
            <input className="cv-input" value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="e.g. a code gets texted to my phone when you sign in" />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" className="cv-open" style={{ padding: "0 20px" }}
              onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="cv-open cv-open--dark" style={{ padding: "0 20px" }} disabled={saving}>
              {saving ? "Saving…" : "Save login"}
            </button>
          </div>
          <p className="cv-page-sub" style={{ margin: 0 }}>
            Add one account at a time. You can edit or remove a login whenever
            you like. For your own safety the password is never shown again
            once it's saved — if you lose track of it, replace it here.
          </p>
        </form>
      )}

      <section className="cv-card cv-card-pad">
        <div className="cv-card-head">
          <h2 className="cv-card-title">Shared for this project</h2>
          <span className="cv-chip cv-chip--gray">{rows.length}</span>
        </div>
        {logins === null ? (
          <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>Loading…</p>
        ) : !rows.length ? (
          <EmptyState
            icon={KeyRound}
            title="Nothing shared yet"
            subtitle="Add the accounts Cre8 Visions needs to get on with this project."
          />
        ) : rows.map((l) => {
          const { icon: Icon, bg, fg } = iconFor(l.label);
          const sub = subtitleFor(l);
          const href = hrefFor(l.url);
          return (
            <div key={l.id} className="cv-lg">
              <span className="cv-ic" style={{ background: bg, color: fg }}><Icon size={22} /></span>
              <span className="cv-lg__who">
                <b>{l.label}</b>
                {sub && <small>{href ? <a href={href} target="_blank" rel="noreferrer">{sub}</a> : sub}</small>}
              </span>
              <span className="cv-lg__pw">{l.has_password ? MASK : "No password"}</span>
              <span className="cv-lg__bt">
                <button type="button" className="cv-mini"
                  onClick={() => setDraft({
                    id: l.id, label: l.label, url: l.url ?? "",
                    username: l.username ?? "", password: "", note: l.note ?? "",
                  })}>
                  Edit
                </button>
                <button type="button" className="cv-mini cv-mini--danger" onClick={() => remove(l.id, l.label)}>
                  Remove
                </button>
              </span>
            </div>
          );
        })}
      </section>
    </div>
  );
}
