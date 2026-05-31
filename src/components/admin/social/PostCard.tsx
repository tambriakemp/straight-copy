import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

export interface SlideData {
  copy?: { heading?: string; body?: string; cta?: string | null } | null;
  design?: unknown;
  image_path?: string | null;
  image_url?: string | null;
  error?: string;
}

export interface SocialPost {
  id: string;
  batch_id: string;
  client_project_id: string;
  order_index: number;
  format: "single" | "carousel";
  status: string;
  caption: string | null;
  hashtags: string[] | null;
  slides: SlideData[];
  copost_post_id: string | null;
  published_at: string | null;
  error: string | null;
}

export function postFromRow(row: { slides: Json } & Omit<SocialPost, "slides">): SocialPost {
  return { ...row, slides: (row.slides as unknown as SlideData[]) ?? [] };
}

export default function PostCard({
  post, onApprove, onReject, onRegenerate, busy,
}: {
  post: SocialPost;
  onApprove: () => void;
  onReject: () => void;
  onRegenerate: (mode: "copy" | "design" | "all") => void;
  busy: boolean;
}) {
  const [slideIdx, setSlideIdx] = useState(0);
  useEffect(() => { setSlideIdx(0); }, [post.id]);

  const slide = post.slides[slideIdx];
  const total = post.slides.length;

  const statusColor = post.status === "approved"
    ? "hsl(120 50% 75%)"
    : post.status === "error"
      ? "hsl(0 70% 75%)"
      : post.status === "published"
        ? "hsl(140 60% 75%)"
        : "hsl(40 20% 80%)";

  return (
    <div style={{
      border: "1px solid var(--crm-border-dark)", borderRadius: 12,
      background: "hsl(40 20% 97% / 0.025)",
      overflow: "hidden", display: "flex", flexDirection: "column",
    }}>
      <div style={{ position: "relative", background: "hsl(0 0% 0% / 0.4)", aspectRatio: "1080/1350" }}>
        {slide?.image_url ? (
          <img src={slide.image_url} alt={`slide ${slideIdx + 1}`}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--crm-taupe)", fontSize: 13, padding: 16, textAlign: "center",
          }}>
            {slide?.error ? `Render failed: ${slide.error}` : "No image"}
          </div>
        )}

        {total > 1 && (
          <>
            <button onClick={() => setSlideIdx((i) => Math.max(0, i - 1))}
              disabled={slideIdx === 0}
              style={navBtn(true)}><ChevronLeft size={16} /></button>
            <button onClick={() => setSlideIdx((i) => Math.min(total - 1, i + 1))}
              disabled={slideIdx === total - 1}
              style={navBtn(false)}><ChevronRight size={16} /></button>
            <div style={{
              position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
              color: "var(--crm-warm-white)", fontSize: 11, background: "hsl(0 0% 0% / 0.55)",
              padding: "3px 8px", borderRadius: 999,
            }}>{slideIdx + 1} / {total}</div>
          </>
        )}
      </div>

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{
            fontSize: 10, letterSpacing: "0.25em", textTransform: "uppercase",
            color: "var(--crm-taupe)",
          }}>
            {post.format} · #{post.order_index + 1}
          </span>
          <span style={{ fontSize: 10, color: statusColor, textTransform: "uppercase", letterSpacing: "0.2em" }}>
            {post.status}
          </span>
        </div>

        {post.caption && (
          <div style={{ fontSize: 13, color: "var(--crm-warm-white)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
            {post.caption}
          </div>
        )}
        {post.hashtags?.length ? (
          <div style={{ fontSize: 12, color: "hsl(200 50% 70%)" }}>
            {post.hashtags.map((h) => `#${h}`).join(" ")}
          </div>
        ) : null}
        {post.error && (
          <div style={{ fontSize: 12, color: "hsl(0 70% 75%)" }}>{post.error}</div>
        )}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
          {post.status !== "approved" && post.status !== "published" && (
            <button onClick={onApprove} disabled={busy} style={btn(true)}>Approve</button>
          )}
          {post.status === "approved" && (
            <button onClick={onReject} disabled={busy} style={btn(false)}>Unapprove</button>
          )}
          <button onClick={() => onRegenerate("all")} disabled={busy} style={btn(false)}>Regenerate</button>
          <button onClick={() => onRegenerate("design")} disabled={busy} style={btn(false)}>Redesign</button>
        </div>
      </div>
    </div>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    fontSize: 11, padding: "5px 10px", borderRadius: 6,
    border: "1px solid var(--crm-border-dark)",
    background: primary ? "var(--crm-warm-white)" : "transparent",
    color: primary ? "var(--crm-ink)" : "var(--crm-warm-white)",
    cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.15em",
  };
}

function navBtn(left: boolean): React.CSSProperties {
  return {
    position: "absolute", top: "50%", [left ? "left" : "right"]: 8, transform: "translateY(-50%)",
    width: 28, height: 28, borderRadius: "50%", border: "none",
    background: "hsl(0 0% 0% / 0.55)", color: "white",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  };
}

