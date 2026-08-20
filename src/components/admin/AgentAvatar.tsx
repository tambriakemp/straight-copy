// An agent's face.
//
// Falls back to a monogram in the agent's accent colour when no photo has been
// uploaded, so the roster looks deliberate from day one rather than like a set
// of broken images. The fallback also covers a photo that fails to load.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const PUBLIC_MARKER = "/storage/v1/object/public/agent-avatars/";

export default function AgentAvatar({ name, url, accent, size = 48 }: {
  name: string;
  url?: string | null;
  accent?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const [resolved, setResolved] = useState<string | null>(url ?? null);
  const tint = accent || "var(--crm-taupe)";
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  // Portraits uploaded before the bucket was made private were stored as public
  // URLs, which now 404. Re-sign those on the fly so the photo still shows.
  useEffect(() => {
    setFailed(false);
    setResolved(url ?? null);
    if (!url || !url.includes(PUBLIC_MARKER)) return;
    const path = decodeURIComponent(url.split(PUBLIC_MARKER)[1].split("?")[0]);
    let active = true;
    supabase.storage
      .from("agent-avatars")
      .createSignedUrl(path, 60 * 60 * 24 * 365)
      .then(({ data }) => {
        if (active && data?.signedUrl) setResolved(data.signedUrl);
      });
    return () => { active = false; };
  }, [url]);

  if (resolved && !failed) {
    return (
      <img
        // `resolved`, not `url` — for a private bucket the stored public URL
        // 404s, and the signed one computed above is the whole point.
        src={resolved}
        alt={name}
        onError={() => setFailed(true)}
        style={{
          width: size, height: size, objectFit: "cover", borderRadius: 3,
          background: "var(--crm-ink)", flexShrink: 0,
          border: `1px solid var(--crm-border-dark)`,
        }}
      />
    );
  }

  return (
    <span
      aria-hidden
      style={{
        width: size, height: size, flexShrink: 0, borderRadius: 3,
        display: "grid", placeItems: "center",
        // Soft wash of the accent rather than a flat block — reads closer to a
        // portrait tile than a coloured square.
        background: `linear-gradient(150deg, ${tint}2e, ${tint}0d)`,
        border: `1px solid ${tint}44`,
        color: tint,
        fontFamily: "Cormorant Garamond, serif",
        fontSize: Math.round(size * 0.46),
        lineHeight: 1,
      }}
    >
      {initial}
    </span>
  );
}
