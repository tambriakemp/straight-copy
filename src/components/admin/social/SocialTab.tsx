// One workflow, in the order you actually work it.
//
// This used to be a three-way view toggle (Batches / Images / Templates) with a
// calendar stacked permanently underneath and the two controls that gate
// posting — the CoPost URL and the autonomy setting — over in the Settings tab.
// Five surfaces for one job, and opening a batch left the calendar dangling
// below it.
//
// Now: what is connected, what needs you, what went wrong, and — folded away —
// where work comes from. Sources is collapsed because feeding the pipeline is
// occasional and reviewing it is daily.
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import NewBatchDialog from "./NewBatchDialog";
import BatchList from "./BatchList";
import BatchDetail from "./BatchDetail";
import DesignTemplatesPanel from "./DesignTemplatesPanel";
import ImagesPanel from "./ImagesPanel";
import ReviewQueue from "./ReviewQueue";
import SendProblems from "./SendProblems";
import CoPostSettingsCard from "./CoPostSettingsCard";
import SocialAutonomyCard from "./SocialAutonomyCard";

export interface SocialBatch {
  id: string;
  status: string;
  brief: string | null;
  platform: string | null;
  single_count: number;
  carousel_count: number;
  slides_per_carousel: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}

const AUTONOMY_LABEL: Record<string, string> = {
  act_in_app: "Holding for review",
  autonomous: "Posting unattended",
  propose: "Paused",
};

type Source = "batches" | "images" | "templates";

export default function SocialTab({ clientProjectId }: { clientProjectId: string }) {
  const [batches, setBatches] = useState<SocialBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [source, setSource] = useState<Source>("batches");
  const [settingsOpen, setSettingsOpen] = useState<null | "copost" | "autonomy">(null);

  const [connected, setConnected] = useState<boolean | null>(null);
  const [autonomy, setAutonomy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("social_post_batches")
      .select("*")
      .eq("client_project_id", clientProjectId)
      .order("created_at", { ascending: false });
    if (error) toast.error(`Failed to load batches: ${error.message}`);
    setBatches((data ?? []) as SocialBatch[]);
    setLoading(false);
  }, [clientProjectId]);

  // Only whether a credential exists, never its value.
  const loadHeader = useCallback(async () => {
    const [secret, project] = await Promise.all([
      supabase.from("project_secrets").select("key")
        .eq("client_project_id", clientProjectId).eq("key", "copost_endpoint_url").maybeSingle(),
      supabase.from("client_projects").select("agent_autonomy")
        .eq("id", clientProjectId).maybeSingle(),
    ]);
    setConnected(!!secret.data);
    setAutonomy((project.data?.agent_autonomy as string | null) ?? null);
  }, [clientProjectId]);

  useEffect(() => {
    setLoading(true);
    void load();
    void loadHeader();
    const ch = supabase
      .channel(`social_batches_${clientProjectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "social_post_batches", filter: `client_project_id=eq.${clientProjectId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [clientProjectId, load, loadHeader]);

  // A batch takes over the whole tab. Nothing else renders underneath it —
  // that was the old bug, where the calendar hung below the batch you opened.
  if (activeBatchId) {
    return (
      <BatchDetail
        batchId={activeBatchId}
        clientProjectId={clientProjectId}
        onBack={() => { setActiveBatchId(null); void load(); }}
      />
    );
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Status strip. The gate sits beside the thing it gates. */}
      <div style={{
        display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
        paddingBottom: 14, borderBottom: "1px solid var(--crm-border-dark)",
        fontSize: 14,
      }}>
        <StatusBit
          label="CoPost"
          value={connected === null ? "…" : connected ? "Connected" : "Not connected"}
          tone={connected === false ? "warn" : "normal"}
          onEdit={() => setSettingsOpen("copost")}
        />
        <StatusBit
          label="Autonomy"
          value={autonomy ? AUTONOMY_LABEL[autonomy] ?? autonomy : "Her default"}
          tone={autonomy === "autonomous" ? "warn" : "normal"}
          onEdit={() => setSettingsOpen("autonomy")}
        />
        {connected === false && (
          <span style={{ fontSize: 14, color: "hsl(0 70% 78%)" }}>
            Nothing can post until the trigger URL is saved.
          </span>
        )}
      </div>

      <ReviewQueue clientProjectId={clientProjectId} />

      <SendProblems clientProjectId={clientProjectId} />

      {/* Where work comes from. Folded: you feed this occasionally. */}
      <section>
        <button
          type="button"
          onClick={() => setSourcesOpen((o) => !o)}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "transparent", border: "none", padding: 0, cursor: "pointer",
            color: "var(--crm-taupe)", fontSize: 13,
            letterSpacing: "0.22em", textTransform: "uppercase",
          }}
        >
          {sourcesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Sources
        </button>

        {sourcesOpen && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["batches", "images", "templates"] as const).map((v) => (
                <Button key={v} onClick={() => setSource(v)}
                  className={source === v
                    ? "bg-warm-white text-ink hover:bg-warm-white/90"
                    : "bg-transparent border border-warm-white/25 text-warm-white hover:bg-warm-white/10"}>
                  {v === "batches" ? "Batches" : v === "images" ? "Images" : "Templates"}
                </Button>
              ))}
              {source === "batches" && (
                <Button onClick={() => setNewOpen(true)}
                  className="bg-transparent border border-warm-white/25 text-warm-white hover:bg-warm-white/10">
                  New batch
                </Button>
              )}
            </div>

            {source === "batches" && (
              <BatchList batches={batches} loading={loading} onOpen={(id) => setActiveBatchId(id)} />
            )}
            {source === "images" && <ImagesPanel clientProjectId={clientProjectId} />}
            {source === "templates" && <DesignTemplatesPanel clientProjectId={clientProjectId} />}
          </div>
        )}
      </section>

      <NewBatchDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        clientProjectId={clientProjectId}
        onCreated={(id) => { setNewOpen(false); setActiveBatchId(id); void load(); }}
      />

      <Dialog
        open={settingsOpen !== null}
        onOpenChange={(o) => { if (!o) { setSettingsOpen(null); void loadHeader(); } }}
      >
        <DialogContent className="max-w-lg">
          <DialogTitle className="sr-only">
            {settingsOpen === "copost" ? "CoPost credentials" : "Autonomy"}
          </DialogTitle>
          {settingsOpen === "copost" && <CoPostSettingsCard clientProjectId={clientProjectId} />}
          {settingsOpen === "autonomy" && <SocialAutonomyCard clientProjectId={clientProjectId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBit({
  label, value, tone, onEdit,
}: {
  label: string;
  value: string;
  tone: "normal" | "warn";
  onEdit: () => void;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 8 }}>
      <span style={{
        color: "var(--crm-taupe)", fontSize: 12,
        letterSpacing: "0.22em", textTransform: "uppercase",
      }}>
        {label}
      </span>
      <span style={{ color: tone === "warn" ? "hsl(40 70% 72%)" : "var(--crm-warm-white)" }}>
        {value}
      </span>
      <button type="button" onClick={onEdit} style={{
        background: "transparent", border: "none", padding: 0, cursor: "pointer",
        color: "var(--crm-taupe)", fontSize: 13, textDecoration: "underline",
        textUnderlineOffset: 3,
      }}>
        change
      </button>
    </span>
  );
}
