import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { ExternalLink, Trash2, Plus } from "lucide-react";

type Link = { id: string; label: string; url: string; created_at: string };
type Note = { id: string; body: string; created_at: string; updated_at: string };

export default function ProjectResourcesSheet({
  projectId,
  projectName,
  open,
  onOpenChange,
}: {
  projectId: string | null;
  projectName?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [links, setLinks] = useState<Link[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newNote, setNewNote] = useState("");
  const [savingLink, setSavingLink] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const load = async () => {
    if (!projectId) return;
    setLoading(true);
    const [l, n] = await Promise.all([
      supabase.from("project_links").select("*").eq("client_project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("project_notes").select("*").eq("client_project_id", projectId).order("created_at", { ascending: false }),
    ]);
    setLinks((l.data as Link[]) ?? []);
    setNotes((n.data as Note[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { if (open && projectId) load(); }, [open, projectId]);

  const addLink = async () => {
    if (!projectId || !newLabel.trim() || !newUrl.trim()) return toast.error("Label and URL required");
    setSavingLink(true);
    let url = newUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const { error } = await supabase.from("project_links").insert({
      client_project_id: projectId, label: newLabel.trim(), url,
    });
    setSavingLink(false);
    if (error) return toast.error(error.message);
    setNewLabel(""); setNewUrl("");
    load();
  };

  const removeLink = async (id: string) => {
    if (!confirm("Delete this link?")) return;
    const { error } = await supabase.from("project_links").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setLinks(prev => prev.filter(x => x.id !== id));
  };

  const addNote = async () => {
    if (!projectId || !newNote.trim()) return;
    setSavingNote(true);
    const { error } = await supabase.from("project_notes").insert({
      client_project_id: projectId, body: newNote.trim(),
    });
    setSavingNote(false);
    if (error) return toast.error(error.message);
    setNewNote("");
    load();
  };

  const removeNote = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    const { error } = await supabase.from("project_notes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setNotes(prev => prev.filter(x => x.id !== id));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!bg-[hsl(36_5%_16%)] !border-[hsl(40_20%_97%/0.08)] !text-[hsl(40_20%_97%)] sm:!max-w-lg w-full overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="font-serif italic text-2xl text-[hsl(40_20%_97%)]">
            Project resources
          </SheetTitle>
          {projectName && (
            <SheetDescription className="text-[hsl(40_10%_70%)]">{projectName}</SheetDescription>
          )}
        </SheetHeader>

        <div className="mt-6 space-y-8">
          {/* Links */}
          <section>
            <div className="text-[11px] tracking-[0.3em] uppercase text-[hsl(40_10%_70%)] mb-3">Links</div>
            <div className="space-y-2 mb-4">
              <input
                className="crm-input"
                placeholder="Label (e.g. Shared Drive)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
              <input
                className="crm-input"
                placeholder="https://..."
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addLink(); }}
              />
              <button className="crm-btn crm-btn--primary" onClick={addLink} disabled={savingLink}>
                <Plus size={14} /> {savingLink ? "Adding…" : "Add link"}
              </button>
            </div>

            {loading ? (
              <div className="text-sm text-[hsl(40_10%_70%)]">Loading…</div>
            ) : links.length === 0 ? (
              <div className="text-sm text-[hsl(40_10%_70%)] italic">No links yet.</div>
            ) : (
              <ul className="space-y-2">
                {links.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-3 p-3 rounded border border-[hsl(40_20%_97%/0.08)] bg-[hsl(40_20%_97%/0.03)]"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{l.label}</div>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[hsl(40_10%_70%)] hover:text-[hsl(40_20%_97%)] truncate block"
                      >
                        {l.url}
                      </a>
                    </div>
                    <a
                      className="crm-btn crm-btn--ghost crm-btn--sm"
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      title="Open"
                    >
                      <ExternalLink size={12} />
                    </a>
                    <button
                      className="crm-btn crm-btn--ghost crm-btn--sm"
                      onClick={() => removeLink(l.id)}
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Notes */}
          <section>
            <div className="text-[11px] tracking-[0.3em] uppercase text-[hsl(40_10%_70%)] mb-3">Notes</div>
            <div className="space-y-2 mb-4">
              <textarea
                className="crm-input"
                rows={4}
                placeholder="Write a note…"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <button className="crm-btn crm-btn--primary" onClick={addNote} disabled={savingNote}>
                <Plus size={14} /> {savingNote ? "Adding…" : "Add note"}
              </button>
            </div>

            {loading ? null : notes.length === 0 ? (
              <div className="text-sm text-[hsl(40_10%_70%)] italic">No notes yet.</div>
            ) : (
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="p-3 rounded border border-[hsl(40_20%_97%/0.08)] bg-[hsl(40_20%_97%/0.03)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm whitespace-pre-wrap flex-1">{n.body}</div>
                      <button
                        className="crm-btn crm-btn--ghost crm-btn--sm"
                        onClick={() => removeNote(n.id)}
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <div className="mt-2 text-[11px] uppercase tracking-[0.2em] text-[hsl(40_10%_60%)]">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
