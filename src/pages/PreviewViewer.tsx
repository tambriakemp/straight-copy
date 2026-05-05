import { useParams } from "react-router-dom";

const SUPABASE_URL = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co`;

export default function PreviewViewer() {
  const params = useParams();
  const slug = params.slug;
  // Capture remainder of path after /p/:slug/
  const rest = (params as any)["*"] || "";
  const url = `${SUPABASE_URL}/functions/v1/preview-serve?slug=${encodeURIComponent(slug || "")}${rest ? `&path=${encodeURIComponent(rest)}` : ""}`;

  if (!slug) return <div style={{ padding: 40, fontFamily: "system-ui" }}>Missing preview link.</div>;

  return (
    <iframe
      src={url}
      title="Site preview"
      style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", border: 0 }}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
    />
  );
}
