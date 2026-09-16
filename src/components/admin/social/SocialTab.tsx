// One workflow, in the order you actually work it.
//
// This used to be a three-way view toggle (Batches / Images / Templates) with a
// calendar stacked permanently underneath and the two controls that gate
// posting — the CoPost URL and the autonomy setting — over in the Settings tab.
// Five surfaces for one job, and opening a batch left the calendar dangling
// below it.
//
// Now: what is connected, what needs you, what went wrong, then the batch
// archive under a fold. The things you CONSULT rather than work through —
// photos, templates, the brand voice, and starting a batch — open in a side
// panel, so looking one up does not take the queue off the screen.
//
// Side panels rather than dialogs throughout, which is what the rest of this
// admin uses: a centred box over the queue hides the very posts it is about.
import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SidePanel from "@/components/admin/SidePanel";
import { useAgentName } from "@/lib/useAgentName";
import NewBatchPanel from "./NewBatchPanel";
import SourcesPanel from "./SourcesPanel";
import BatchList from "./BatchList";
import BatchDetail from "./BatchDetail";
import ReviewQueue from "./ReviewQueue";
import SendProblems from "./SendProblems";
import CoPostSettingsCard from "./CoPostSettingsCard";
import SocialAutonomyCard from "./SocialAutonomyCard";
import { autonomyPill, postsUnattended, type AutonomyLevel } from "./socialStatus";

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

function barBtn(primary: boolean): React.CSSProperties {
  return {
    fontSize: 14, borderRadius: 4, cursor: "pointer",
    padding: primary ? "8px 16px" : "8px 14px",
    border: primary ? "none" : "1px solid var(--crm-border-dark)",
    background: primary ? "var(--crm-warm-white)" : "transparent",
    color: primary ? "var(--crm-ink)" : "var(--crm-warm-white)",
    fontWeight: primary ? 500 : 400,
  };
}

export default function SocialTab({ clientProjectId }: { clientProjectId: string }) {
  const who = useAgentName("social-media", "your social media manager");
  const [batches, setBatches] = useState<SocialBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState<null | "copost" | "autonomy">(null);

  const [connected, setConnected] = useState<boolean | null>(null);
  const [autonomy, setAutonomy] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);

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

    // Two steps because runs are keyed by the agent's uuid while the row is
    // found by `key` — the stable identifier, since these get renamed.
    const { data: agent } = await supabase.from("agents")
      .select("id").eq("key", "social-media").maybeSingle();
    if (!agent?.id) return;
    const { data: run } = await supabase.from("agent_runs")
      .select("started_at").eq("agent_id", agent.id)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    setLastRun(run?.started_at ?? null);
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
          value={autonomyPill(autonomy as AutonomyLevel | null, who)}
          tone={postsUnattended(autonomy as AutonomyLevel | null) ? "warn" : "normal"}
          onEdit={() => setSettingsOpen("autonomy")}
        />
        {lastRun && (
          <span style={{ fontSize: 14, color: "var(--crm-taupe)" }}>
            Last run {formatDistanceToNow(new Date(lastRun), { addSuffix: true })}
          </span>
        )}
        {connected === false && (
          <span style={{ fontSize: 14, color: "hsl(0 70% 78%)" }}>
            Nothing can post until the trigger URL is saved.
          </span>
        )}

        {/* Both open a side panel. The sources switcher that used to live down
            the page is gone: it swapped the whole tab, so checking which
            template was active cost you your place in the queue. */}
        <div style={{ display: "flex", gap: 10, marginLeft: "auto", flexWrap: "wrap" }}>
          <button type="button" onClick={() => setSourcesOpen(true)} style={barBtn(false)}>
            Manage sources
          </button>
          <button type="button" onClick={() => setNewOpen(true)} style={barBtn(true)}>
            New batch
          </button>
        </div>
      </div>

      <ReviewQueue clientProjectId={clientProjectId} />

      <SendProblems clientProjectId={clientProjectId} />

      <BatchList batches={batches} loading={loading} onOpen={(id) => setActiveBatchId(id)} />

      <NewBatchPanel
        open={newOpen}
        onClose={() => setNewOpen(false)}
        clientProjectId={clientProjectId}
        onCreated={(id) => { setNewOpen(false); setActiveBatchId(id); void load(); }}
      />

      <SourcesPanel
        open={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
        clientProjectId={clientProjectId}
      />

      {/* Reloads the strip on close, because both of these change what it says. */}
      <SidePanel
        open={settingsOpen !== null}
        onClose={() => { setSettingsOpen(null); void loadHeader(); }}
        title={settingsOpen === "copost" ? "CoPost" : "Autonomy"}
        subtitle={settingsOpen === "copost"
          ? "Where approved posts are sent."
          : `What ${who} may do for this client.`}
        width={470}
      >
        {settingsOpen === "copost" && <CoPostSettingsCard clientProjectId={clientProjectId} />}
        {settingsOpen === "autonomy" && <SocialAutonomyCard clientProjectId={clientProjectId} />}
      </SidePanel>
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
