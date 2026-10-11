// The client page's Notes tab, laid out to the Admin Journeys canvas:
// write a note at the top, saved notes under it newest first.
//
// Its own table rather than `clients.notes`. That column is one free-text
// field several other surfaces already read; turning it into an append-only
// log would have changed what all of them show. It is still printed here,
// above the list, labelled as what it is.
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import EmptyState from "@/components/admin/cv/EmptyState";
import type { ClientNote } from "./useClientRecord";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    + " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function NotesTab({
  clientId, clientNotes, notes, onChanged,
}: {
  clientId: string;
  /** The single `clients.notes` field, if anything was ever written in it. */
  clientNotes: string | null;
  notes: ClientNote[];
  onChanged: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const save = async () => {
    const body = draft.trim();
    if (!body) { toast.error("Write something first"); return; }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("client_notes").insert({
      client_id: clientId, body, created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setDraft("");
    toast.success("Note saved");
    onChanged();
  };

  const saveEdit = async (id: string) => {
    const body = editDraft.trim();
    if (!body) { toast.error("A note cannot be empty — delete it instead"); return; }
    const { error } = await supabase.from("client_notes")
      .update({ body, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditing(null);
    onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this note? This cannot be undone.")) return;
    const { error } = await supabase.from("client_notes").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Note deleted");
    onChanged();
  };

  return (
    <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 className="cv-card-title">Notes</h2>

      <label className="cv-field">
        New note
        <textarea
          className="cv-textarea"
          rows={4}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a note about this client..."
        />
      </label>
      <button
        type="button"
        className="cv-open cv-open--dark"
        style={{ alignSelf: "flex-start", padding: "0 22px" }}
        onClick={save}
        disabled={saving}
      >
        {saving ? "Saving…" : "Save note"}
      </button>

      <div className="cv-rule" />

      {clientNotes?.trim() && (
        <div className="cv-lg" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--cv-muted)" }}>From the client record</div>
          <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{clientNotes}</div>
        </div>
      )}

      {!notes.length && !clientNotes?.trim() ? (
        <EmptyState title="No notes yet" subtitle="Anything you write above reads here, newest first." />
      ) : notes.map((n) => (
        <div key={n.id} className="cv-lg" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--cv-muted)" }}>{fmtWhen(n.created_at)}</span>
            {n.project && (
              <span className="cv-chip cv-chip--gray">{n.project.name}</span>
            )}
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {n.project ? (
                // A project note is edited on the project it belongs to.
                // Shown here, because it is the same thing to whoever is
                // reading, and two places to look is how one goes missing.
                <a className="cv-mini" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}
                  href={`/admin/clients/${clientId}/projects/${n.project.id}`}>
                  Open project
                </a>
              ) : editing === n.id ? (
                <>
                  <button type="button" className="cv-mini" onClick={() => saveEdit(n.id)}>Save</button>
                  <button type="button" className="cv-mini" onClick={() => setEditing(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <button
                    type="button" className="cv-mini"
                    onClick={() => { setEditing(n.id); setEditDraft(n.body); }}
                  >
                    Edit
                  </button>
                  <button type="button" className="cv-mini cv-mini--danger" onClick={() => remove(n.id)}>Delete</button>
                </>
              )}
            </span>
          </div>
          {editing === n.id && !n.project ? (
            <textarea
              className="cv-textarea" rows={4}
              value={editDraft} onChange={(e) => setEditDraft(e.target.value)}
            />
          ) : (
            <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{n.body}</div>
          )}
        </div>
      ))}
    </section>
  );
}
