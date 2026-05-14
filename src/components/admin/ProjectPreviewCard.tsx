import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, MonitorSmartphone, Plus, Copy, Check, ExternalLink, Pencil, X } from "lucide-react";
import PreviewDetail from "@/pages/admin/PreviewDetail";

type Props = {
  clientId: string;
  clientProjectId: string;
  projectName: string;
  clientLabel?: string | null;
};

type PreviewRow = { id: string; slug: string; name: string };

export default function ProjectPreviewCard({ clientId, clientProjectId, projectName, clientLabel }: Props) {
  const [preview, setPreview] = useState<PreviewRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const base = useMemo(() => window.location.origin, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("preview_projects")
      .select("id,slug,name")
      .eq("client_project_id", clientProjectId)
      .maybeSingle();
    setPreview((data as PreviewRow | null) ?? null);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [clientProjectId]);

  const create = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("preview-admin", {
        body: {
          action: "create",
          name: projectName,
          client_id: clientId,
          client_label: clientLabel ?? null,
          attach_to_project_id: clientProjectId,
        },
      });
      if (error || !data?.project) throw new Error(error?.message || "Failed to create preview");
      toast.success("Preview created");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!preview) return;
    await navigator.clipboard.writeText(`${base}/p/${preview.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{
      marginTop: 24,
      background: "hsl(40 20% 97% / 0.03)",
      border: "1px solid var(--crm-border-dark)",
      borderRadius: 12,
      overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "16px 22px", background: "transparent", border: 0, cursor: "pointer",
          color: "var(--crm-warm-white)", textAlign: "left",
        }}
      >
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <MonitorSmartphone size={14} style={{ color: "var(--crm-accent)" }} />
        <span style={{ fontSize: 13, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>
          Preview
        </span>
        {preview && (
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <PreviewNameInline
              name={preview.name}
              onSave={async (next) => {
                const { data } = await supabase.functions.invoke("preview-admin", {
                  body: { action: "update", id: preview.id, name: next },
                });
                if (data?.project) setPreview({ ...preview, name: data.project.name });
                else await load();
                toast.success("Renamed");
              }}
            />
            <code style={{ fontSize: 12, color: "var(--crm-taupe)", fontFamily: "monospace" }}>
              /p/{preview.slug.slice(0, 12)}…
            </code>
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); void copy(); }}
              className="crm-btn crm-btn--ghost crm-btn--sm"
              title="Copy share link"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </span>
            <a
              href={`${base}/p/${preview.slug}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="crm-btn crm-btn--ghost crm-btn--sm"
              title="Open preview"
            >
              <ExternalLink size={12} />
            </a>
          </span>
        )}
      </button>

      {open && (
        <div style={{ padding: "0 22px 22px", borderTop: "1px solid var(--crm-border-dark)" }}>
          {loading ? (
            <div style={{ padding: 24, color: "var(--crm-taupe)" }}>Loading…</div>
          ) : !preview ? (
            <div style={{ padding: "32px 0", textAlign: "center" }}>
              <div style={{ color: "var(--crm-taupe)", fontSize: 14, marginBottom: 14 }}>
                No preview attached to this project yet.
              </div>
              <button className="crm-btn crm-btn--primary" onClick={create} disabled={creating}>
                <Plus size={14} /> {creating ? "Creating…" : "Create preview"}
              </button>
            </div>
          ) : (
            <div style={{ paddingTop: 12 }}>
              <PreviewDetail overrideId={preview.id} embedded />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
