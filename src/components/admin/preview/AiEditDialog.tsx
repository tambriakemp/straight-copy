import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  pagePath: string;
  pageDir?: string; // e.g. "" or "subdir/"
  onApplied: () => void;
};

type Attachment = { file: File; preview: string; targetPath: string };

function slugifyName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : "";
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
  const stamp = Date.now().toString(36).slice(-4);
  return `${slug}-${stamp}${ext}`;
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
}

export default function AiEditDialog({ open, onOpenChange, projectId, pagePath, onApplied }: Props) {
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPrompt("");
      setAttachments((prev) => {
        prev.forEach((a) => URL.revokeObjectURL(a.preview));
        return [];
      });
    }
  }, [open]);

  const addFiles = (filelist: FileList | null) => {
    if (!filelist) return;
    const next: Attachment[] = [];
    for (const f of Array.from(filelist)) {
      if (!f.type.startsWith("image/")) {
        toast.error(`${f.name} isn't an image`);
        continue;
      }
      next.push({
        file: f,
        preview: URL.createObjectURL(f),
        targetPath: `images/${slugifyName(f.name)}`,
      });
    }
    setAttachments((prev) => [...prev, ...next]);
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.preview);
      return copy;
    });
  };

  const apply = async () => {
    if (!prompt.trim()) {
      toast.error("Add a prompt first");
      return;
    }
    setBusy(true);
    try {
      // 1. Upload attachments
      const newAssets: { path: string; mime: string }[] = [];
      for (const a of attachments) {
        const b64 = await fileToBase64(a.file);
        const { data, error } = await supabase.functions.invoke("preview-admin", {
          body: {
            action: "file_upload_single",
            project_id: projectId,
            path: a.targetPath,
            content_base64: b64,
            mime: a.file.type,
          },
        });
        if (error) throw new Error(error.message);
        newAssets.push({ path: data?.path || a.targetPath, mime: a.file.type });
      }

      // 2. Call AI edit
      const { data, error } = await supabase.functions.invoke("preview-ai-edit", {
        body: {
          project_id: projectId,
          page_path: pagePath,
          prompt: prompt.trim(),
          new_assets: newAssets,
        },
      });
      if (error) throw new Error(error.message);
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success("Page updated");
      onOpenChange(false);
      onApplied();
    } catch (e: any) {
      toast.error(e.message || "AI edit failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent
        style={{
          maxWidth: 720,
          background: "var(--crm-ink, #1a1814)",
          border: "1px solid var(--crm-border-dark)",
          color: "var(--crm-warm-white)",
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--crm-font-serif)", fontWeight: 300, fontSize: 24 }}>
            <Sparkles size={18} style={{ color: "var(--crm-accent)" }} />
            Edit page with AI
          </DialogTitle>
          <div style={{ fontSize: 13, color: "var(--crm-taupe)", fontFamily: "monospace", marginTop: 4 }}>{pagePath}</div>
        </DialogHeader>

        <div style={{ display: "grid", gap: 16, marginTop: 8 }}>
          {/* Attachments */}
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)", marginBottom: 8 }}>
              Image Attachments (optional)
            </div>
            <input ref={fileInput} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
              onClick={() => fileInput.current?.click()}
              style={{
                border: "1px dashed var(--crm-border-dark)",
                borderRadius: 8,
                padding: attachments.length > 0 ? "12px" : "20px 12px",
                cursor: "pointer",
                background: "hsl(40 20% 97% / 0.02)",
              }}
            >
              {attachments.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--crm-taupe)", fontSize: 14 }}>
                  <Upload size={14} /> Drop images here or click to browse
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                  {attachments.map((a, i) => (
                    <div key={i} style={{ position: "relative", borderRadius: 6, overflow: "hidden", border: "1px solid var(--crm-border-dark)" }} onClick={(e) => e.stopPropagation()}>
                      <img src={a.preview} alt="" style={{ width: "100%", height: 90, objectFit: "cover", display: "block" }} />
                      <button
                        onClick={() => removeAttachment(i)}
                        style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.7)", border: 0, color: "#fff", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                      >
                        <X size={12} />
                      </button>
                      <div style={{ padding: "4px 6px", fontSize: 11, color: "var(--crm-taupe)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.targetPath}</div>
                    </div>
                  ))}
                  <button
                    onClick={(e) => { e.stopPropagation(); fileInput.current?.click(); }}
                    style={{ minHeight: 90, border: "1px dashed var(--crm-border-dark)", borderRadius: 6, background: "transparent", color: "var(--crm-taupe)", cursor: "pointer", fontSize: 13 }}
                  >
                    + Add more
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)", marginBottom: 8 }}>
              Instruction
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Replace the 'Drop a hero photo' placeholder with the attached team photo, cropped to fill the frame."
              rows={5}
              style={{
                width: "100%",
                background: "hsl(40 20% 97% / 0.03)",
                border: "1px solid var(--crm-border-dark)",
                borderRadius: 8,
                padding: "12px 14px",
                color: "var(--crm-warm-white)",
                fontSize: 15,
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--crm-taupe)" }}>
              The AI rewrites the HTML directly — no JavaScript will be added unless you ask.
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button className="crm-btn crm-btn--ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</button>
            <button className="crm-btn crm-btn--primary" onClick={apply} disabled={busy}>
              {busy ? <><Loader2 size={14} className="animate-spin" /> Working…</> : <><Sparkles size={14} /> Apply changes</>}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
