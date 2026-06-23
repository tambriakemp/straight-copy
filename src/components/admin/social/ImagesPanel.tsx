import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ImageTile, { type SocialImage } from "./ImageTile";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export default function ImagesPanel({ clientProjectId }: { clientProjectId: string }) {
  const [images, setImages] = useState<SocialImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("social_images")
      .select("*")
      .eq("client_project_id", clientProjectId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setImages((data ?? []) as SocialImage[]);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    void load();
    const ch = supabase
      .channel(`social_images_${clientProjectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "social_images", filter: `client_project_id=eq.${clientProjectId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientProjectId]);

  const toggleSelect = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(images.map((i) => i.id)));
  const clearSelection = () => setSelected(new Set());

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      const newIds: string[] = [];
      for (const file of list) {
        if (!ACCEPTED.includes(file.type)) {
          toast.error(`${file.name}: unsupported type`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: over 10 MB`);
          continue;
        }
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${clientProjectId}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage.from("social-images").upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (up.error) { toast.error(`${file.name}: ${up.error.message}`); continue; }

        const { data: row, error: insErr } = await supabase
          .from("social_images")
          .insert({
            client_project_id: clientProjectId,
            storage_path: path,
            mime_type: file.type,
            size_bytes: file.size,
            created_by: userId,
            caption_status: "pending",
          })
          .select("id")
          .single();
        if (insErr || !row) { toast.error(insErr?.message ?? "insert failed"); continue; }
        newIds.push(row.id);
      }
      await load();
      // Kick off analysis (fire-and-forget; realtime updates UI)
      if (newIds.length) {
        void supabase.functions.invoke("analyze-social-image", { body: { image_ids: newIds } });
        toast.success(`Uploaded ${newIds.length} image${newIds.length === 1 ? "" : "s"} — generating captions…`);
      }
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const regenerate = async (ids: string[]) => {
    if (!ids.length) return;
    await supabase.from("social_images").update({ caption_status: "pending" }).in("id", ids);
    const { error } = await supabase.functions.invoke("analyze-social-image", { body: { image_ids: ids } });
    if (error) toast.error(error.message); else toast.success("Regenerating captions…");
  };

  const remove = async (ids: string[]) => {
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} image${ids.length === 1 ? "" : "s"}?`)) return;
    const rows = images.filter((i) => ids.includes(i.id));
    const paths = rows.map((r) => r.storage_path);
    if (paths.length) await supabase.storage.from("social-images").remove(paths);
    const { error } = await supabase.from("social_images").delete().in("id", ids);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      clearSelection();
    }
  };

  const sendToCoPost = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-images-to-copost", {
        body: { image_ids: ids },
      });
      if (error) throw error;
      const errPayload = data as { error?: string; results?: Array<{ ok: boolean; error?: string }> };
      if (errPayload?.error) throw new Error(errPayload.error);
      const okCount = errPayload?.results?.filter((r) => r.ok).length ?? 0;
      const failCount = (errPayload?.results?.length ?? 0) - okCount;
      if (okCount) toast.success(`Sent ${okCount} to CoPost`);
      if (failCount) toast.error(`${failCount} failed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send to CoPost failed");
    } finally {
      setBusy(false);
    }
  };

  const saveCaption = async (id: string, caption: string, hashtags: string[]) => {
    const { error } = await supabase
      .from("social_images")
      .update({ caption, hashtags, caption_status: "ready" })
      .eq("id", id);
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  const selectedIds = Array.from(selected);
  const sendableIds = images.filter((i) => selected.has(i.id) && i.copost_status !== "sent").map((i) => i.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) void upload(e.dataTransfer.files);
        }}
        style={{
          border: `1px dashed ${dragOver ? "var(--crm-warm-white)" : "var(--crm-border-dark)"}`,
          borderRadius: 8,
          padding: 24,
          textAlign: "center",
          color: "var(--crm-taupe)",
          fontSize: 13,
          background: dragOver ? "rgba(255,255,255,0.03)" : "transparent",
        }}
      >
        <div style={{ marginBottom: 10 }}>
          Drag &amp; drop social images here (JPG, PNG, WebP — up to 10 MB each)
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          multiple
          style={{ display: "none" }}
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="bg-transparent border border-warm-white/25 text-warm-white hover:bg-warm-white/10"
        >
          {busy ? "Uploading…" : "Choose files"}
        </Button>
      </div>

      {/* Bulk bar */}
      {images.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, flexWrap: "wrap",
          padding: "8px 12px",
          border: "1px solid var(--crm-border-dark)", borderRadius: 8,
        }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--crm-taupe)", fontSize: 12 }}>
            <span>{selected.size} of {images.length} selected</span>
            <Button size="sm" variant="ghost" onClick={selectAll}
              className="text-warm-white hover:bg-warm-white/10 h-7 px-2 text-xs">Select all</Button>
            {selected.size > 0 && (
              <Button size="sm" variant="ghost" onClick={clearSelection}
                className="text-warm-white hover:bg-warm-white/10 h-7 px-2 text-xs">Clear</Button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" disabled={!selected.size || busy} onClick={() => regenerate(selectedIds)}
              className="bg-transparent border border-warm-white/25 text-warm-white hover:bg-warm-white/10">
              Regenerate captions
            </Button>
            <Button size="sm" disabled={!selected.size || busy} onClick={() => remove(selectedIds)}
              className="bg-transparent border border-warm-white/25 text-warm-white hover:bg-warm-white/10">
              Delete
            </Button>
            <Button size="sm" disabled={!sendableIds.length || busy} onClick={() => sendToCoPost(sendableIds)}
              className="bg-warm-white text-ink hover:bg-warm-white/90">
              {busy ? "Sending…" : `Send ${sendableIds.length} to CoPost`}
            </Button>
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div style={{ color: "var(--crm-taupe)", padding: 16 }}>Loading…</div>
      ) : images.length === 0 ? (
        <div style={{ color: "var(--crm-taupe)", padding: 16, fontSize: 13 }}>
          No images yet. Upload some to generate captions.
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 16,
        }}>
          {images.map((img) => (
            <ImageTile
              key={img.id}
              image={img}
              selected={selected.has(img.id)}
              onToggleSelect={() => toggleSelect(img.id)}
              onRegenerate={() => regenerate([img.id])}
              onDelete={() => remove([img.id])}
              onSend={() => sendToCoPost([img.id])}
              onSaveCaption={(c, h) => saveCaption(img.id, c, h)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
