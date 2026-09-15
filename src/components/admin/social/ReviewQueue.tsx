// The one thing this tab is for: deciding on work that is waiting.
//
// A deck rather than a grid. Approving a batch used to mean opening the tab,
// picking a view, opening a batch, scrolling a grid of thumbnails, clicking
// Approve on each card and then hitting Send — six actions before anything
// ships, with the image cropped square so a typographic quote card could not
// actually be read. Here it is one item at a time, at posting size, with `A`
// to approve and move on.
//
// Two sources, because both are real work waiting on a person:
//   • social_posts in `draft`      — written and rendered, needs a yes
//   • social_images with no caption — uploaded, needs words before it can go
// They are not merged in the database; nothing here needs a migration.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { SlideData } from "./PostCard";

interface QueueItem {
  key: string;
  kind: "post" | "image";
  id: string;
  createdAt: string;
  caption: string | null;
  hashtags: string[];
  /** Storage paths for each slide. Posts can carry several; photos one. */
  paths: string[];
  bucket: "social-posts" | "social-images";
  /** What this item is waiting on, said plainly. */
  waitingFor: string;
  renderError?: string;
}

export default function ReviewQueue({ clientProjectId }: { clientProjectId: string }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [slideIdx, setSlideIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftCaption, setDraftCaption] = useState("");
  const [draftTags, setDraftTags] = useState("");

  const load = useCallback(async () => {
    const [postsRes, imagesRes] = await Promise.all([
      supabase.from("social_posts")
        .select("id, caption, hashtags, slides, created_at, error")
        .eq("client_project_id", clientProjectId).eq("status", "draft")
        .order("created_at", { ascending: true }),
      supabase.from("social_images")
        .select("id, caption, hashtags, storage_path, created_at, copost_status")
        .eq("client_project_id", clientProjectId).neq("copost_status", "sent")
        .order("created_at", { ascending: true }),
    ]);
    if (postsRes.error) toast.error(postsRes.error.message);
    if (imagesRes.error) toast.error(imagesRes.error.message);

    const posts: QueueItem[] = (postsRes.data ?? []).map((p) => {
      const slides = (p.slides as unknown as SlideData[]) ?? [];
      return {
        key: `post:${p.id}`,
        kind: "post" as const,
        id: p.id,
        createdAt: p.created_at,
        caption: p.caption,
        hashtags: (p.hashtags ?? []) as string[],
        paths: slides.map((s) => s.image_path).filter(Boolean) as string[],
        bucket: "social-posts" as const,
        waitingFor: "Needs your approval",
        renderError: slides.find((s) => s.error)?.error,
      };
    });

    // Only photos with nothing written yet. One with a caption is already
    // usable and is not waiting on a decision anyone has to make here.
    const images: QueueItem[] = (imagesRes.data ?? [])
      .filter((i) => !(i.caption ?? "").trim())
      .map((i) => ({
        key: `image:${i.id}`,
        kind: "image" as const,
        id: i.id,
        createdAt: i.created_at,
        caption: i.caption,
        hashtags: (i.hashtags ?? []) as string[],
        paths: i.storage_path ? [i.storage_path] : [],
        bucket: "social-images" as const,
        waitingFor: "Needs a caption",
      }));

    const merged = [...posts, ...images].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    setItems(merged);
    setLoading(false);
  }, [clientProjectId]);

  useEffect(() => {
    setLoading(true);
    void load();
    const ch = supabase
      .channel(`social_review_${clientProjectId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "social_posts", filter: `client_project_id=eq.${clientProjectId}` },
        () => { void load(); })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "social_images", filter: `client_project_id=eq.${clientProjectId}` },
        () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [clientProjectId, load]);

  // Stay in range when the list shrinks under you — approving the last item
  // must land on the empty state, not on nothing.
  const current = items[Math.min(idx, Math.max(0, items.length - 1))];
  useEffect(() => {
    if (idx > items.length - 1) setIdx(Math.max(0, items.length - 1));
  }, [items.length, idx]);
  useEffect(() => { setSlideIdx(0); setEditing(false); }, [current?.key]);
  useEffect(() => {
    setDraftCaption(current?.caption ?? "");
    setDraftTags((current?.hashtags ?? []).join(", "));
  }, [current?.key, current?.caption, current?.hashtags]);

  // --- the image ---
  const path = current?.paths[slideIdx];
  const [url, setUrl] = useState<string | null>(null);
  const [imgState, setImgState] = useState<"resolving" | "error" | "ready">("resolving");
  const retried = useRef(false);

  useEffect(() => {
    retried.current = false;
    let active = true;
    setUrl(null);
    setImgState("resolving");
    if (!path || !current) { setImgState("error"); return; }
    const bucket = current.bucket;
    void (async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
      if (!active) return;
      if (error || !data?.signedUrl) { setImgState("error"); return; }
      setUrl(data.signedUrl);
      setImgState("ready");
    })();
    return () => { active = false; };
  }, [path, current]);

  const advance = useCallback(() => {
    setIdx((i) => Math.min(i + 1, Math.max(0, items.length - 1)));
  }, [items.length]);

  const approve = useCallback(async () => {
    if (!current || busy) return;
    if (current.kind !== "post") {
      toast.message("Photos are approved by writing a caption — press E.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("social_posts")
      .update({ status: "approved" }).eq("id", current.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Approved");
    advance();
  }, [current, busy, advance]);

  const saveCaption = useCallback(async () => {
    if (!current) return;
    const tags = draftTags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
    setBusy(true);
    // Branched rather than a shared patch object: the two tables have different
    // column sets, and a union patch does not typecheck against either.
    const { error } = current.kind === "post"
      ? await supabase.from("social_posts")
          .update({ caption: draftCaption.trim(), hashtags: tags })
          .eq("id", current.id)
      : await supabase.from("social_images")
          .update({ caption: draftCaption.trim(), hashtags: tags, caption_status: "ready" })
          .eq("id", current.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    setEditing(false);
  }, [current, draftCaption, draftTags]);

  // --- keyboard ---
  //
  // Deliberately inert while a field has focus: `A` must type an "a" when you
  // are writing a caption, not approve the post behind the editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (
        el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable
      );
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "a" || e.key === "A") { e.preventDefault(); void approve(); }
      else if (e.key === "s" || e.key === "S") { e.preventDefault(); advance(); }
      else if (e.key === "e" || e.key === "E") { e.preventDefault(); setEditing(true); }
      else if (e.key === "ArrowRight") { e.preventDefault(); advance(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [approve, advance]);

  const counts = useMemo(() => ({
    posts: items.filter((i) => i.kind === "post").length,
    images: items.filter((i) => i.kind === "image").length,
  }), [items]);

  if (loading) {
    return <div style={{ color: "var(--crm-taupe)", fontSize: 15 }}>Loading…</div>;
  }

  if (!items.length || !current) {
    return (
      <section style={{
        border: "1px solid var(--crm-border-dark)", borderRadius: 12,
        padding: "48px 24px", textAlign: "center",
      }}>
        <div style={{ fontSize: 20, color: "var(--crm-warm-white)", marginBottom: 6 }}>
          Nothing waiting on you.
        </div>
        <div style={{ fontSize: 15, color: "var(--crm-taupe)" }}>
          Approved work is with CoPost. Add more from Sources below.
        </div>
      </section>
    );
  }

  const totalSlides = current.paths.length;

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: 20, fontWeight: 500, color: "var(--crm-warm-white)", marginBottom: 4 }}>
            Needs you
          </h3>
          <p style={{ fontSize: 15, color: "var(--crm-taupe)" }}>
            {counts.posts} to approve{counts.images ? `, ${counts.images} needing a caption` : ""}.
          </p>
        </div>
        <div style={{ fontSize: 14, color: "var(--crm-taupe)", letterSpacing: "0.1em" }}>
          {idx + 1} of {items.length}
        </div>
      </div>

      <div style={{
        display: "grid", gap: 20, alignItems: "start",
        gridTemplateColumns: "minmax(0, 420px) minmax(260px, 1fr)",
      }}>
        {/* The card, uncropped. These are typographic — a crop is unreadable. */}
        <div style={{
          position: "relative", aspectRatio: "1080/1350",
          background: "hsl(0 0% 0% / 0.45)", borderRadius: 10,
          border: "1px solid var(--crm-border-dark)", overflow: "hidden",
        }}>
          {imgState === "ready" && url ? (
            <img
              src={url}
              alt={`${current.kind} ${idx + 1}`}
              onError={() => {
                if (retried.current || !path) { setImgState("error"); return; }
                retried.current = true;
                void (async () => {
                  const { data } = await supabase.storage.from(current.bucket).createSignedUrl(path, 3600);
                  if (data?.signedUrl) setUrl(data.signedUrl); else setImgState("error");
                })();
              }}
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          ) : (
            <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center",
              justifyContent: "center", color: "var(--crm-taupe)", fontSize: 15,
              padding: 16, textAlign: "center",
            }}>
              {imgState === "resolving"
                ? "Loading…"
                : current.renderError
                  ? `Render failed: ${current.renderError}`
                  : "No image"}
            </div>
          )}

          {totalSlides > 1 && (
            <>
              <button type="button" onClick={() => setSlideIdx((i) => Math.max(0, i - 1))}
                disabled={slideIdx === 0} style={navBtn(true)}><ChevronLeft size={16} /></button>
              <button type="button" onClick={() => setSlideIdx((i) => Math.min(totalSlides - 1, i + 1))}
                disabled={slideIdx === totalSlides - 1} style={navBtn(false)}><ChevronRight size={16} /></button>
              <div style={{
                position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
                color: "var(--crm-warm-white)", fontSize: 13,
                background: "hsl(0 0% 0% / 0.6)", padding: "3px 8px", borderRadius: 999,
              }}>{slideIdx + 1} / {totalSlides}</div>
            </>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={{
            fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase",
            color: current.kind === "image" ? "hsl(40 60% 75%)" : "var(--crm-taupe)",
          }}>
            {current.waitingFor}
          </span>

          {!editing ? (
            <>
              {current.caption ? (
                <div style={{ fontSize: 15, color: "var(--crm-warm-white)", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                  {current.caption}
                </div>
              ) : (
                <div style={{ fontSize: 15, color: "var(--crm-taupe)", fontStyle: "italic" }}>
                  No caption yet.
                </div>
              )}
              {current.hashtags.length > 0 && (
                <div style={{ fontSize: 14, color: "hsl(200 50% 72%)" }}>
                  {current.hashtags.map((h) => `#${h}`).join(" ")}
                </div>
              )}
            </>
          ) : (
            <>
              <Textarea rows={6} value={draftCaption} onChange={(e) => setDraftCaption(e.target.value)}
                className="bg-black/30 text-warm-white border-warm-white/20" />
              <Input value={draftTags} onChange={(e) => setDraftTags(e.target.value)}
                placeholder="comma, separated, hashtags"
                className="bg-black/30 text-warm-white border-warm-white/20" />
              <div style={{ display: "flex", gap: 8 }}>
                <Button onClick={() => void saveCaption()} disabled={busy}
                  className="bg-warm-white text-ink hover:bg-warm-white/90">Save</Button>
                <Button variant="ghost" onClick={() => setEditing(false)}
                  className="text-warm-white hover:bg-warm-white/10">Cancel</Button>
              </div>
            </>
          )}

          {!editing && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {current.kind === "post" && (
                <Button onClick={() => void approve()} disabled={busy}
                  className="bg-warm-white text-ink hover:bg-warm-white/90">Approve</Button>
              )}
              <Button onClick={() => setEditing(true)} disabled={busy}
                className="bg-transparent border border-warm-white/25 text-warm-white hover:bg-warm-white/10">
                Edit
              </Button>
              <Button onClick={advance} disabled={busy}
                className="bg-transparent border border-warm-white/25 text-warm-white hover:bg-warm-white/10">
                Skip
              </Button>
            </div>
          )}

          <div style={{ fontSize: 13, color: "var(--crm-taupe)", marginTop: "auto", letterSpacing: "0.06em" }}>
            A approve · E edit · S skip · ← → move
          </div>
        </div>
      </div>
    </section>
  );
}

function navBtn(left: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    width: 28, height: 28, borderRadius: "50%", border: "none",
    background: "hsl(0 0% 0% / 0.6)", color: "white",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  };
  return left ? { ...base, left: 8 } : { ...base, right: 8 };
}
