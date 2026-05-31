import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import NewBatchDialog from "./NewBatchDialog";
import BatchList from "./BatchList";
import BatchDetail from "./BatchDetail";
import DesignTemplatesPanel from "./DesignTemplatesPanel";

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

export default function SocialTab({ clientProjectId }: { clientProjectId: string }) {
  const [batches, setBatches] = useState<SocialBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [view, setView] = useState<"batches" | "templates">("batches");

  const load = async () => {
    const { data, error } = await supabase
      .from("social_post_batches")
      .select("*")
      .eq("client_project_id", clientProjectId)
      .order("created_at", { ascending: false });
    if (error) toast.error(`Failed to load batches: ${error.message}`);
    setBatches((data ?? []) as SocialBatch[]);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    void load();
    const ch = supabase
      .channel(`social_batches_${clientProjectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "social_post_batches", filter: `client_project_id=eq.${clientProjectId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientProjectId]);

  if (activeBatchId) {
    return (
      <BatchDetail
        batchId={activeBatchId}
        clientProjectId={clientProjectId}
        onBack={() => setActiveBatchId(null)}
      />
    );
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 500, color: "var(--crm-warm-white)", marginBottom: 4 }}>
            Social posts & carousels
          </h3>
          <p style={{ fontSize: 14, color: "var(--crm-taupe)" }}>
            Generate batches of on-brand posts and carousels using the client's intake, brand kit, and brand voice.
          </p>
        </div>
        <Button onClick={() => setNewOpen(true)} className="bg-transparent border border-warm-white/25 text-warm-white hover:bg-warm-white/10">
          New batch
        </Button>
      </div>

      <BatchList
        batches={batches}
        loading={loading}
        onOpen={(id) => setActiveBatchId(id)}
      />

      <NewBatchDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        clientProjectId={clientProjectId}
        onCreated={(id) => { setNewOpen(false); setActiveBatchId(id); void load(); }}
      />
    </div>
  );
}
