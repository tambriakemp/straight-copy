import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import PostCard, { postFromRow, type SocialPost } from "./PostCard";
import type { SocialBatch } from "./SocialTab";

export default function BatchDetail({
  batchId, clientProjectId, onBack,
}: {
  batchId: string;
  clientProjectId: string;
  onBack: () => void;
}) {
  const [batch, setBatch] = useState<SocialBatch | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = async () => {
    const [{ data: b }, { data: p }] = await Promise.all([
      supabase.from("social_post_batches").select("*").eq("id", batchId).single(),
      supabase.from("social_posts").select("*").eq("batch_id", batchId).order("order_index", { ascending: true }),
    ]);
    setBatch((b ?? null) as SocialBatch | null);
    setPosts((p ?? []).map((r) => postFromRow(r as never)));
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    void load();
    const ch = supabase
      .channel(`social_batch_${batchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "social_posts", filter: `batch_id=eq.${batchId}` },
        () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "social_post_batches", filter: `id=eq.${batchId}` },
        () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId]);

  const updateStatus = async (postId: string, status: string) => {
    setBusyId(postId);
    const { error } = await supabase.from("social_posts").update({ status }).eq("id", postId);
    setBusyId(null);
    if (error) toast.error(error.message);
  };

  const approveAll = async () => {
    const ids = posts.filter((p) => p.status === "draft").map((p) => p.id);
    if (!ids.length) return;
    const { error } = await supabase.from("social_posts").update({ status: "approved" }).in("id", ids);
    if (error) toast.error(error.message);
    else toast.success(`Approved ${ids.length} post${ids.length === 1 ? "" : "s"}`);
  };

  const regenerate = async (postId: string, mode: "copy" | "design" | "all") => {
    setBusyId(postId);
    try {
      const { data, error } = await supabase.functions.invoke("regenerate-social-post", {
        body: { post_id: postId, mode },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success("Regenerated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Regenerate failed");
    } finally {
      setBusyId(null);
    }
  };

  const sendToCoPost = async () => {
    const approvedCount = posts.filter((p) => p.status === "approved").length;
    if (!approvedCount) {
      toast.error("Approve at least one post first");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-to-copost", {
        body: { batch_id: batchId },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      toast.success("Sent to CoPost");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send to CoPost failed");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div style={{ color: "var(--crm-taupe)", padding: 16 }}>Loading…</div>;
  if (!batch) return <div style={{ color: "var(--crm-taupe)", padding: 16 }}>Batch not found.</div>;

  const approvedCount = posts.filter((p) => p.status === "approved").length;
  const draftCount = posts.filter((p) => p.status === "draft").length;
  const errorCount = posts.filter((p) => p.status === "error").length;
  const isGenerating = batch.status === "drafting" && posts.length < batch.single_count + batch.carousel_count;

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
      <button onClick={onBack}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6, background: "transparent",
          border: "none", color: "var(--crm-taupe)", fontSize: 12, cursor: "pointer",
          textTransform: "uppercase", letterSpacing: "0.2em", padding: 0,
        }}>
        <ChevronLeft size={14} /> Back to batches
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: 18, color: "var(--crm-warm-white)", marginBottom: 4 }}>
            {batch.brief || `${batch.single_count + batch.carousel_count} posts`}
          </h3>
          <div style={{ fontSize: 12, color: "var(--crm-taupe)" }}>
            Status: {batch.status} · {posts.length} generated · {approvedCount} approved · {draftCount} draft
            {errorCount > 0 ? ` · ${errorCount} error` : ""}
          </div>
          {batch.error && (
            <div style={{ fontSize: 12, color: "hsl(0 70% 75%)", marginTop: 6 }}>{batch.error}</div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={approveAll} disabled={!draftCount}
            className="bg-transparent border border-warm-white/25 text-warm-white hover:bg-warm-white/10">
            Approve all
          </Button>
          <Button onClick={sendToCoPost} disabled={sending || !approvedCount}
            className="bg-warm-white text-ink hover:bg-warm-white/90">
            {sending ? "Sending…" : `Send ${approvedCount} to CoPost`}
          </Button>
        </div>
      </div>

      {isGenerating && (
        <div style={{
          padding: 12, border: "1px solid var(--crm-border-dark)", borderRadius: 8,
          color: "var(--crm-taupe)", fontSize: 13,
        }}>
          Generating posts… this typically takes 1–3 minutes. Updates appear live.
        </div>
      )}

      <div style={{
        display: "grid", gap: 16,
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      }}>
        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            busy={busyId === p.id}
            onApprove={() => updateStatus(p.id, "approved")}
            onReject={() => updateStatus(p.id, "draft")}
            onRegenerate={(mode) => regenerate(p.id, mode)}
          />
        ))}
      </div>
    </div>
  );
}
