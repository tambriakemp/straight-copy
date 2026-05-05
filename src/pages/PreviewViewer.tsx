import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const SUPABASE_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co`;

export default function PreviewViewer() {
  const params = useParams();
  const slug = params.slug;
  const rest = (params as any)["*"] || "";
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const url = `${SUPABASE_URL}/functions/v1/preview-serve?slug=${encodeURIComponent(slug || "")}${rest ? `&path=${encodeURIComponent(rest)}` : ""}`;

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (!cancelled) setHtml(text);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load preview");
      }
    })();
    return () => { cancelled = true; };
  }, [url, slug]);

  if (!slug) return <div style={{ padding: 40, fontFamily: "system-ui" }}>Missing preview link.</div>;
  if (error) return <div style={{ padding: 40, fontFamily: "system-ui" }}>Could not load preview: {error}</div>;
  if (html === null) return <div style={{ padding: 40, fontFamily: "system-ui" }}>Loading preview…</div>;

  return (
    <iframe
      srcDoc={html}
      title="Site preview"
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", border: 0 }}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
    />
  );
}
