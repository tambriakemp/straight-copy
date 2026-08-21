// A stored PDF, rendered inline.
//
// Fetched into a blob rather than pointed at directly. A Supabase Storage
// signed URL is another origin and arrives with headers that make it a
// download, so a frame pointed straight at it comes up blank and looks
// blocked. Reading the bytes and handing the browser a same-origin blob: URL
// sidesteps content-disposition and framing headers entirely.
//
// Shared between the admin proposal preview and the client portal on purpose:
// the portal had the same blank frame, which is the worse half of the bug —
// a client opening a proposal and seeing nothing.
import { useEffect, useState } from "react";

export default function PdfFrame({
  url, title, height = "72vh",
}: {
  url: string;
  title: string;
  height?: number | string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let created: string | null = null;
    let cancelled = false;
    setBlobUrl(null);
    setFailed(false);

    (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(String(r.status));
        const blob = await r.blob();
        if (cancelled) return;
        created = URL.createObjectURL(
          // Force the type: storage can serve octet-stream, which prompts a
          // download even from a blob URL.
          blob.type === "application/pdf"
            ? blob
            : new Blob([blob], { type: "application/pdf" }),
        );
        setBlobUrl(created);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    // Revoked on unmount and whenever the url changes; without this, previewing
    // several documents leaks a copy of each for the life of the tab.
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url]);

  if (failed) {
    return (
      <p style={{ color: "var(--crm-taupe)", fontSize: 16 }}>
        Could not load the PDF here.{" "}
        <a href={url} target="_blank" rel="noreferrer" style={{ color: "var(--crm-accent)" }}>
          Open it in a new tab
        </a>.
      </p>
    );
  }

  if (!blobUrl) {
    return <p style={{ color: "var(--crm-taupe)", fontSize: 16 }}>Loading the PDF…</p>;
  }

  return (
    <iframe
      src={blobUrl}
      title={title}
      style={{
        width: "100%", height, border: "1px solid var(--crm-border-dark)",
        borderRadius: 8, background: "#fff",
      }}
    />
  );
}
