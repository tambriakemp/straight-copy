// Where a post's raw material lives: photos, templates, and the voice it is
// written in.
//
// These were three top-level buttons that swapped the whole tab — so looking up
// which template was active meant leaving the approval queue, and coming back
// meant finding your place in it again. They are sources, not destinations:
// you consult them while working on something else, which is what a side panel
// is for.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import SidePanel from "@/components/admin/SidePanel";
import ImagesPanel from "./ImagesPanel";
import DesignTemplatesPanel from "./DesignTemplatesPanel";

type Tab = "images" | "templates" | "voice";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "images", label: "Images" },
  { key: "templates", label: "Templates" },
  { key: "voice", label: "Brand voice" },
];

interface BrandVoice {
  status: string;
  quickRef: string | null;
  pdfUrl: string | null;
  clientName: string | null;
}

export default function SourcesPanel({
  open, onClose, clientProjectId,
}: {
  open: boolean;
  onClose: () => void;
  clientProjectId: string;
}) {
  const [tab, setTab] = useState<Tab>("images");

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Sources"
      subtitle="The photos, templates and voice every post is built from."
      width={560}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key}
            style={{
              fontSize: 13, padding: "6px 14px", borderRadius: 4, cursor: "pointer",
              border: tab === t.key ? "none" : "1px solid var(--crm-border-dark)",
              background: tab === t.key ? "var(--crm-warm-white)" : "transparent",
              color: tab === t.key ? "var(--crm-ink)" : "var(--crm-taupe)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "images" && <ImagesPanel clientProjectId={clientProjectId} />}
      {tab === "templates" && <DesignTemplatesPanel clientProjectId={clientProjectId} embedded />}
      {tab === "voice" && <BrandVoiceView clientProjectId={clientProjectId} />}
    </SidePanel>
  );
}

/**
 * The brand voice, read-only.
 *
 * Read-only on purpose: this is the document captions are written FROM, and it
 * is generated and approved in the client's own brand-kit flow. Offering an
 * edit box here would create a second copy of the truth, and the caption
 * generator reads the client row rather than anything typed on this tab.
 */
function BrandVoiceView({ clientProjectId }: { clientProjectId: string }) {
  const [voice, setVoice] = useState<BrandVoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // The project knows its client; the voice lives on the client, because
      // one client running three projects has one voice.
      const { data: project } = await supabase
        .from("client_projects").select("client_id").eq("id", clientProjectId).maybeSingle();
      if (!project?.client_id) { if (!cancelled) { setLoading(false); } return; }
      const { data: client } = await supabase
        .from("clients")
        .select("contact_name, business_name, brand_voice_status, brand_voice_quick_ref, brand_voice_doc, brand_voice_pdf_url")
        .eq("id", project.client_id).maybeSingle();
      if (cancelled) return;
      setVoice({
        status: client?.brand_voice_status ?? "pending",
        // The generator writes _doc and _quick_ref. Nothing writes
        // _brand_voice_content, so it is not read here.
        quickRef: client?.brand_voice_quick_ref ?? client?.brand_voice_doc ?? null,
        pdfUrl: client?.brand_voice_pdf_url ?? null,
        clientName: client?.contact_name ?? client?.business_name ?? null,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientProjectId]);

  if (loading) return <div style={{ color: "var(--crm-taupe)", fontSize: 15 }}>Loading…</div>;

  if (!voice?.quickRef) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontSize: 15, color: "var(--crm-taupe)", margin: 0, lineHeight: 1.55 }}>
          No brand voice yet{voice?.status && voice.status !== "pending" ? ` — status is ${voice.status}` : ""}.
          Captions fall back to the client's intake and brand kit until one exists,
          which reads generically.
        </p>
        <p style={{ fontSize: 14, color: "var(--crm-taupe)", margin: 0 }}>
          It is generated from the client's brand-kit flow, on their page.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ fontSize: 14, color: "var(--crm-taupe)", margin: 0, lineHeight: 1.55 }}>
        What every caption on this project is written to sound like.
        {voice.clientName ? ` Generated for ${voice.clientName}.` : ""}
      </p>
      <div style={{
        fontSize: 15, lineHeight: 1.6, color: "hsl(40 15% 85%)", whiteSpace: "pre-wrap",
        border: "1px solid var(--crm-border-dark)", borderRadius: 6, padding: 14,
        background: "hsl(40 20% 97% / 0.02)",
      }}>
        {voice.quickRef}
      </div>
      {voice.pdfUrl && (
        <a href={voice.pdfUrl} target="_blank" rel="noreferrer"
          style={{ fontSize: 14, color: "var(--crm-bronze, #c08f5e)" }}>
          Open the full brand voice document →
        </a>
      )}
    </div>
  );
}
