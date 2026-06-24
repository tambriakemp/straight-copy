import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Check, RefreshCw, Trash2, Send, Pencil, Copy } from "lucide-react";
import { toast } from "sonner";

export interface SocialImage {
  id: string;
  client_project_id: string;
  storage_path: string;
  caption: string | null;
  hashtags: string[] | null;
  caption_status: string;
  caption_error: string | null;
  copost_status: string;
  copost_sent_at: string | null;
  copost_error: string | null;
  created_at: string;
}

export default function ImageTile({
  image, selected, onToggleSelect, onRegenerate, onDelete, onSend, onSaveCaption,
}: {
  image: SocialImage;
  selected: boolean;
  onToggleSelect: () => void;
  onRegenerate: () => void;
  onDelete: () => void;
  onSend: () => void;
  onSaveCaption: (caption: string, hashtags: string[]) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftCaption, setDraftCaption] = useState(image.caption ?? "");
  const [draftTags, setDraftTags] = useState((image.hashtags ?? []).join(", "));

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.storage.from("social-images")
        .createSignedUrl(image.storage_path, 60 * 60);
      if (active) setUrl(data?.signedUrl ?? null);
    })();
    return () => { active = false; };
  }, [image.storage_path]);

  useEffect(() => {
    setDraftCaption(image.caption ?? "");
    setDraftTags((image.hashtags ?? []).join(", "));
  }, [image.caption, image.hashtags]);

  const sent = image.copost_status === "sent";
  const sending = image.copost_status === "sending";

  const save = () => {
    const tags = draftTags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
    onSaveCaption(draftCaption.trim(), tags);
    setEditing(false);
  };

  const copyAll = async () => {
    const tags = (image.hashtags ?? []).map((h) => `#${h}`).join(" ");
    const text = [image.caption ?? "", tags].filter(Boolean).join("\n\n");
    await navigator.clipboard.writeText(text);
    toast.success("Copied caption");
  };

  return (
    <div style={{
      border: `1px solid ${selected ? "var(--crm-warm-white)" : "var(--crm-border-dark)"}`,
      borderRadius: 8,
      overflow: "hidden",
      background: "rgba(0,0,0,0.15)",
      display: "flex",
      flexDirection: "column",
    }}>
      <div style={{ position: "relative", aspectRatio: "1 / 1", background: "#111" }}>
        {url ? (
          <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "var(--crm-taupe)", fontSize: 12 }}>
            Loading…
          </div>
        )}
        {/* Select checkbox */}
        <label style={{
          position: "absolute", top: 8, left: 8,
          width: 24, height: 24, borderRadius: 4,
          background: selected ? "var(--crm-warm-white)" : "rgba(0,0,0,0.6)",
          border: "1px solid var(--crm-warm-white)",
          display: "grid", placeItems: "center", cursor: "pointer",
        }}>
          <input type="checkbox" checked={selected} onChange={onToggleSelect}
            style={{ position: "absolute", opacity: 0, pointerEvents: "none" }} />
          {selected && <Check size={16} color="#000" />}
        </label>
        {/* Status badges */}
        {sent && (
          <div style={{
            position: "absolute", top: 8, right: 8,
            padding: "4px 8px", borderRadius: 4,
            background: "rgba(40,150,90,0.85)", color: "#fff",
            fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase",
          }}>
            Sent to CoPost
          </div>
        )}
        {sending && (
          <div style={{
            position: "absolute", top: 8, right: 8,
            padding: "4px 8px", borderRadius: 4,
            background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 11,
          }}>
            Sending…
          </div>
        )}
        {image.copost_status === "error" && (
          <div style={{
            position: "absolute", top: 8, right: 8,
            padding: "4px 8px", borderRadius: 4,
            background: "rgba(180,50,50,0.9)", color: "#fff",
            fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase",
          }}>
            Failed
          </div>
        )}
      </div>

      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, fontSize: 13, color: "var(--crm-warm-white)" }}>
        {image.caption_status === "pending" && (
          <div style={{ color: "var(--crm-taupe)", fontStyle: "italic" }}>Generating caption…</div>
        )}
        {image.caption_status === "error" && (
          <div style={{ color: "hsl(0 70% 75%)", fontSize: 12 }}>{image.caption_error ?? "Caption failed"}</div>
        )}

        {!editing ? (
          <>
            {image.caption && (
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{image.caption}</div>
            )}
            {image.hashtags && image.hashtags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {image.hashtags.map((h) => (
                  <span key={h} style={{
                    fontSize: 11, color: "var(--crm-taupe)",
                    background: "rgba(255,255,255,0.05)",
                    padding: "2px 6px", borderRadius: 3,
                  }}>#{h}</span>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <Textarea value={draftCaption} onChange={(e) => setDraftCaption(e.target.value)} rows={4}
              className="bg-black/30 text-warm-white border-warm-white/20 text-xs" />
            <Input value={draftTags} onChange={(e) => setDraftTags(e.target.value)}
              placeholder="comma, separated, hashtags"
              className="bg-black/30 text-warm-white border-warm-white/20 text-xs" />
            <div style={{ display: "flex", gap: 6 }}>
              <Button size="sm" onClick={save}
                className="bg-warm-white text-ink hover:bg-warm-white/90 h-7 text-xs">Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}
                className="text-warm-white hover:bg-warm-white/10 h-7 text-xs">Cancel</Button>
            </div>
          </>
        )}

        {image.copost_status === "error" && (
          <div style={{ color: "hsl(0 70% 75%)", fontSize: 11 }}>CoPost: {image.copost_error}</div>
        )}

        {!editing && (
          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
            <IconBtn title="Edit" onClick={() => setEditing(true)}><Pencil size={13} /></IconBtn>
            <IconBtn title="Regenerate" onClick={onRegenerate}><RefreshCw size={13} /></IconBtn>
            <IconBtn title="Copy caption" onClick={copyAll}><Copy size={13} /></IconBtn>
            <IconBtn title="Delete" onClick={onDelete}><Trash2 size={13} /></IconBtn>
            <IconBtn title={sent ? "Already sent" : "Send to CoPost"} onClick={onSend} disabled={sent || sending}>
              <Send size={13} />
            </IconBtn>
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled }: {
  children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: "transparent",
        border: "1px solid var(--crm-border-dark)",
        color: disabled ? "var(--crm-taupe)" : "var(--crm-warm-white)",
        borderRadius: 4,
        padding: "4px 6px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        display: "inline-flex", alignItems: "center",
      }}
    >
      {children}
    </button>
  );
}
