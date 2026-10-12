// The project page's Notes tab: write a note at the top, saved notes
// under it newest first, each one editable and deletable.
//
// The list was here already and was read-only — you could see notes on
// a project and had nowhere to write one, which meant the only place to
// record anything about a project was the client's Notes tab, where it
// then sat under every other project's notes too. The client tab has
// said "a project note is edited on the project it belongs to" since it
// shipped; this is that place.
//
// `client_projects.notes` is a separate, single free-text field that
// other surfaces read. It is printed above the list, labelled as what
// it is, rather than being folded into the log — the same arrangement
// the client page uses for `clients.notes`.
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import EmptyState from "@/components/admin/cv/EmptyState";

export interface ProjectNoteRow {
  id: string;
  body: string;
  created_at: string;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    + " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function ProjectNotesTab({
  clientProjectId, projectNotes, notes, onChanged,
}: {
  clientProjectId: string;
  /** The single `client_projects.notes` field, if anything is in it. */
  projectNotes: string | null;
  notes: ProjectNoteRow[];
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
    const { error } = await supabase.from("project_notes")
      .insert({ client_project_id: clientProjectId, body });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setDraft("");
    toast.success("Note saved");
    onChanged();
  };

  const saveEdit = async (id: string) => {
    const body = editDraft.trim();
    // Blank is not an edit, it is a delete that leaves a dated empty row
    // behind — which reads as a note whose text got lost.
    if (!body) { toast.error("A note cannot be empty — delete it instead"); return; }
    const { error } = await supabase.from("project_notes")
      .update({ body, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditing(null);
    onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this note? This cannot be undone.")) return;
    const { error } = await supabase.from("project_notes").delete().eq("id", id);
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
          placeholder="Write a note about this project..."
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

      {projectNotes?.trim() && (
        <div className="cv-lg" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--cv-muted)" }}>From the project record</div>
          <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{projectNotes}</div>
        </div>
      )}

      {!notes.length && !projectNotes?.trim() ? (
        <EmptyState title="No notes yet" subtitle="Anything you write above reads here, newest first." />
      ) : notes.map((n) => (
        <div key={n.id} className="cv-lg" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--cv-muted)" }}>{fmtWhen(n.created_at)}</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {editing === n.id ? (
                <>
                  <button type="button" className="cv-mini" onClick={() => saveEdit(n.id)}>Save</button>
                  <button type="button" className="cv-mini" onClick={() => setEditing(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <button type="button" className="cv-mini"
                    onClick={() => { setEditing(n.id); setEditDraft(n.body); }}>
                    Edit
                  </button>
                  <button type="button" className="cv-mini cv-mini--danger" onClick={() => remove(n.id)}>
                    Delete
                  </button>
                </>
              )}
            </span>
          </div>
          {editing === n.id ? (
            <textarea
              className="cv-textarea" rows={5}
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
