import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { ExternalLink, Trash2, Plus, Link2, StickyNote } from "lucide-react";

type LinkRow = { id: string; label: string; url: string; created_at: string };
type Note = { id: string; body: string; created_at: string; updated_at: string };

const INK = "hsl(36 5% 16%)";
const CREAM = "hsl(40 20% 97%)";
const TAUPE = "hsl(40 10% 70%)";
const BORDER = "hsl(40 20% 97% / 0.10)";
const SURFACE = "hsl(40 20% 97% / 0.04)";

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
  const [links, setLinks] = useState<LinkRow[]>([]);
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
    setLinks((l.data as LinkRow[]) ?? []);
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

  const inputStyle: React.CSSProperties = {
    width: "100%",
    background: "transparent",
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    padding: "10px 12px",
    color: CREAM,
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: 11,
    letterSpacing: "0.3em",
    textTransform: "uppercase",
    color: TAUPE,
    marginBottom: 14,
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        style={{ background: INK, color: CREAM, borderColor: BORDER }}
        className="!w-full sm:!max-w-md overflow-y-auto p-0"
      >
        <div style={{ padding: "32px 28px 40px" }}>
          <SheetHeader>
            <SheetTitle
              style={{
                fontFamily: "var(--crm-font-serif, 'Cormorant Garamond', serif)",
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: 32,
                color: CREAM,
                lineHeight: 1.1,
              }}
            >
              Project resources
            </SheetTitle>
            {projectName && (
              <SheetDescription style={{ color: TAUPE, fontSize: 13, marginTop: 4 }}>
                {projectName}
              </SheetDescription>
            )}
          </SheetHeader>

          <div style={{ height: 1, background: BORDER, margin: "24px 0 28px" }} />

          {/* Links */}
          <section style={{ marginBottom: 36 }}>
            <div style={sectionLabel}><Link2 size={12} /> Links</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              <input
                style={inputStyle}
                placeholder="Label (e.g. Shared Drive)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
              <input
                style={inputStyle}
                placeholder="https://..."
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addLink(); }}
              />
              <button
                onClick={addLink}
                disabled={savingLink}
                style={{
                  alignSelf: "flex-start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  border: `1px solid ${BORDER}`,
                  background: "transparent",
                  color: CREAM,
                  fontSize: 12,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  borderRadius: 4,
                  cursor: savingLink ? "default" : "pointer",
                  opacity: savingLink ? 0.6 : 1,
                }}
              >
                <Plus size={12} /> {savingLink ? "Adding…" : "Add link"}
              </button>
            </div>

            {loading ? (
              <div style={{ fontSize: 13, color: TAUPE }}>Loading…</div>
            ) : links.length === 0 ? (
              <div style={{ fontSize: 13, color: TAUPE, fontStyle: "italic" }}>No links yet.</div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {links.map((l) => (
                  <li
                    key={l.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: 12,
                      borderRadius: 6,
                      border: `1px solid ${BORDER}`,
                      background: SURFACE,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: CREAM, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {l.label}
                      </div>
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: "block", fontSize: 12, color: TAUPE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {l.url}
                      </a>
                    </div>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      title="Open"
                      style={{ color: TAUPE, padding: 6, display: "inline-flex" }}
                    >
                      <ExternalLink size={14} />
                    </a>
                    <button
                      onClick={() => removeLink(l.id)}
                      title="Delete"
                      style={{ background: "transparent", border: "none", color: TAUPE, padding: 6, cursor: "pointer", display: "inline-flex" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Notes */}
          <section>
            <div style={sectionLabel}><StickyNote size={12} /> Notes</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              <textarea
                style={{ ...inputStyle, resize: "vertical", minHeight: 90 }}
                rows={4}
                placeholder="Write a note…"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
              />
              <button
                onClick={addNote}
                disabled={savingNote}
                style={{
                  alignSelf: "flex-start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 14px",
                  border: `1px solid ${BORDER}`,
                  background: "transparent",
                  color: CREAM,
                  fontSize: 12,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  borderRadius: 4,
                  cursor: savingNote ? "default" : "pointer",
                  opacity: savingNote ? 0.6 : 1,
                }}
              >
                <Plus size={12} /> {savingNote ? "Adding…" : "Add note"}
              </button>
            </div>

            {loading ? null : notes.length === 0 ? (
              <div style={{ fontSize: 13, color: TAUPE, fontStyle: "italic" }}>No notes yet.</div>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                {notes.map((n) => (
                  <li
                    key={n.id}
                    style={{
                      padding: 14,
                      borderRadius: 6,
                      border: `1px solid ${BORDER}`,
                      background: SURFACE,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <div style={{ flex: 1, fontSize: 14, color: CREAM, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                        {n.body}
                      </div>
                      <button
                        onClick={() => removeNote(n.id)}
                        title="Delete"
                        style={{ background: "transparent", border: "none", color: TAUPE, padding: 4, cursor: "pointer", display: "inline-flex" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "hsl(40 10% 55%)" }}>
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
