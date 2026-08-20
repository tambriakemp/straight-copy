// An agent's face.
//
// Falls back to a monogram in the agent's accent colour when no photo has been
// uploaded, so the roster looks deliberate from day one rather than like a set
// of broken images. The fallback also covers a photo that fails to load.
import { useState } from "react";

export default function AgentAvatar({ name, url, accent, size = 48 }: {
  name: string;
  url?: string | null;
  accent?: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const tint = accent || "var(--crm-taupe)";
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  if (url && !failed) {
    return (
      <img
        src={url}
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
