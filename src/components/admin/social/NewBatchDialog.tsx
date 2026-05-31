import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TemplateOption { id: string; name: string; format_support: string; active: boolean }

export default function NewBatchDialog({
  open, onOpenChange, clientProjectId, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientProjectId: string;
  onCreated: (batchId: string) => void;
}) {
  const [singleCount, setSingleCount] = useState(0);
  const [carouselCount, setCarouselCount] = useState(3);
  const [slidesPerCarousel, setSlidesPerCarousel] = useState(5);
  const [platform, setPlatform] = useState("instagram");
  const [brief, setBrief] = useState("");
  const [templateId, setTemplateId] = useState<string>("auto");
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("social_design_templates")
        .select("id, name, format_support, active")
        .eq("client_project_id", clientProjectId)
        .eq("active", true)
        .order("created_at", { ascending: false });
      setTemplates((data ?? []) as TemplateOption[]);
    })();
  }, [open, clientProjectId]);

  const submit = async () => {
    if (singleCount + carouselCount === 0) {
      toast.error("Request at least one post");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-social-posts", {
        body: {
          client_project_id: clientProjectId,
          single_count: singleCount,
          carousel_count: carouselCount,
          slides_per_carousel: slidesPerCarousel,
          platform,
          brief: brief.trim() || null,
          design_template_id: templateId !== "auto" && templateId !== "ai" ? templateId : null,
        },
      });
      if (error) throw error;
      const batchId = (data as { batch_id?: string })?.batch_id;
      if (!batchId) throw new Error("no batch id returned");
      toast.success("Generation started");
      onCreated(batchId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start generation");
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-ink border-warm-white/15 text-warm-white sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>New social batch</DialogTitle>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label>Single posts</Label>
              <Input type="number" min={0} max={20} value={singleCount}
                onChange={(e) => setSingleCount(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                className="bg-transparent border-warm-white/20 text-warm-white" />
            </div>
            <div>
              <Label>Carousels</Label>
              <Input type="number" min={0} max={20} value={carouselCount}
                onChange={(e) => setCarouselCount(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                className="bg-transparent border-warm-white/20 text-warm-white" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label>Slides per carousel</Label>
              <Input type="number" min={2} max={10} value={slidesPerCarousel}
                onChange={(e) => setSlidesPerCarousel(Math.max(2, Math.min(10, Number(e.target.value) || 5)))}
                className="bg-transparent border-warm-white/20 text-warm-white" />
            </div>
            <div>
              <Label>Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="bg-transparent border-warm-white/20 text-warm-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-ink border-warm-white/15 text-warm-white">
                  <SelectItem value="instagram">Instagram</SelectItem>
                  <SelectItem value="linkedin">LinkedIn</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Campaign brief (optional)</Label>
            <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={3}
              placeholder="e.g. spring promo, focus on transformation stories"
              className="bg-transparent border-warm-white/20 text-warm-white placeholder:text-taupe" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}
            className="bg-warm-white text-ink hover:bg-warm-white/90">
            {submitting ? "Starting…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
