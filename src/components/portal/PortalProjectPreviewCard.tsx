import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Check, ExternalLink } from "lucide-react";

type Props = { clientProjectId: string };
type PreviewRow = { id: string; slug: string; name: string; archived: boolean };

export default function PortalProjectPreviewCard({ clientProjectId }: Props) {
  const [preview, setPreview] = useState<PreviewRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const base = useMemo(() => window.location.origin, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("preview_projects")
        .select("id, slug, name, archived")
        .eq("client_project_id", clientProjectId)
        .maybeSingle();
      if (!cancelled) {
        setPreview((data as PreviewRow | null) ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientProjectId]);

  if (loading) return null;
  if (!preview || preview.archived) {
    return (
      <section className="portal-access is-open" style={{ scrollMarginTop: 24 }}>
        <div className="portal-access__toggle" style={{ cursor: "default" }}>
          <div className="portal-access__toggle-left">
            <div className="portal-access__eyebrow">Preview</div>
            <h2 className="portal-access__title">Coming <em>soon</em>.</h2>
          </div>
        </div>
        <div className="portal-access__body">
          <p className="portal-access__intro">
            Your preview link isn't ready yet. We'll let you know the moment it's available.
          </p>
        </div>
      </section>
    );
  }

  const url = `${base}/p/${preview.slug}`;
  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="portal-access is-open" style={{ scrollMarginTop: 24 }}>
      <div className="portal-access__toggle" style={{ cursor: "default" }}>
        <div className="portal-access__toggle-left">
          <div className="portal-access__eyebrow">Preview</div>
          <h2 className="portal-access__title">{preview.name}</h2>
        </div>
        <div className="portal-access__toggle-right">
          <span className="portal-access__status">Live</span>
        </div>
      </div>
      <div className="portal-access__body">
        <p className="portal-access__intro">
          Open the latest preview in a new tab. Use the in-page comment tools to leave feedback.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
          <a className="crm-btn crm-btn--bronze crm-btn--sm" href={url} target="_blank" rel="noreferrer">
            <ExternalLink size={12} /> Open preview
          </a>
          <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={copy} title="Copy share link">
            {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy link"}
          </button>
          <code style={{ fontSize: 12, color: "hsl(30 8% 62%)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis" }}>
            {url}
          </code>
        </div>
      </div>
    </section>
  );
}
