import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export interface DesignTemplate {
  id: string;
  name: string;
  format_support: "single" | "carousel" | "both";
  slide_count: number;
  active: boolean;
  created_at: string;
}

export default function DesignTemplatesPanel({ clientProjectId }: { clientProjectId: string }) {
  const [templates, setTemplates] = useState<DesignTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFormat, setNewFormat] = useState<"single" | "carousel" | "both">("both");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("social_design_templates")
      .select("id, name, format_support, slide_count, active, created_at")
      .eq("client_project_id", clientProjectId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setTemplates((data ?? []) as DesignTemplate[]);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientProjectId]);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { toast.error("Choose an HTML file"); return; }
    if (!newName.trim()) { toast.error("Give the template a name"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Template must be under 5MB"); return; }
    setUploading(true);
    try {
      const text = await file.text();
      const slideMatches = text.match(/<(section|article|div)[^>]*(?:class="[^"]*\b(?:slide|carousel-slide|post-slide|card)\b[^"]*"|data-slide(?:="[^"]*")?)[^>]*>/gi);
      const slide_count = slideMatches?.length || 1;
      const { error } = await supabase.from("social_design_templates").insert({
        client_project_id: clientProjectId,
        name: newName.trim(),
        format_support: newFormat,
        html_source: text,
        slide_count,
        active: true,
      });
      if (error) throw error;
      toast.success("Template uploaded");
      setNewName("");
      if (fileRef.current) fileRef.current.value = "";
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("social_design_templates").update({ active }).eq("id", id);
    if (error) toast.error(error.message);
    else void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    const { error } = await supabase.from("social_design_templates").delete().eq("id", id);
    if (error) toast.error(error.message);
    else void load();
  };

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 500, color: "var(--crm-warm-white)", marginBottom: 4 }}>
          Design templates
        </h3>
        <p style={{ fontSize: 13, color: "var(--crm-taupe)" }}>
          Upload HTML files that define the visual style of this client's posts and carousels.
          The generator uses your template as the design skeleton and fills in fresh copy on each slide.
          Use <code>{`{{heading}}`}</code>, <code>{`{{body}}`}</code>, <code>{`{{cta}}`}</code> placeholders
          for the cleanest results.
        </p>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "1fr 180px 180px auto", gap: 8, alignItems: "end",
        padding: 12, border: "1px solid var(--crm-border-dark)", borderRadius: 8,
      }}>
        <div>
          <Label>Template name</Label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Editorial Cream"
            className="bg-transparent border-warm-white/20 text-warm-white" />
        </div>
        <div>
          <Label>Use for</Label>
          <Select value={newFormat} onValueChange={(v) => setNewFormat(v as "single" | "carousel" | "both")}>
            <SelectTrigger className="bg-transparent border-warm-white/20 text-warm-white"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-ink border-warm-white/15 text-warm-white">
              <SelectItem value="both">Both</SelectItem>
              <SelectItem value="single">Single posts</SelectItem>
              <SelectItem value="carousel">Carousels</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>HTML file</Label>
          <input ref={fileRef} type="file" accept=".html,text/html" style={{ fontSize: 12, color: "var(--crm-warm-white)" }} />
        </div>
        <Button onClick={upload} disabled={uploading}
          className="bg-warm-white text-ink hover:bg-warm-white/90">
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      </div>

      {loading ? (
        <div style={{ color: "var(--crm-taupe)", fontSize: 13 }}>Loading…</div>
      ) : templates.length === 0 ? (
        <div style={{ color: "var(--crm-taupe)", fontSize: 13 }}>No templates yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {templates.map((t) => (
            <div key={t.id} style={{
              display: "grid", gridTemplateColumns: "1fr 110px 100px 90px 36px", gap: 12, alignItems: "center",
              padding: "8px 12px", border: "1px solid var(--crm-border-dark)", borderRadius: 6,
            }}>
              <div style={{ color: "var(--crm-warm-white)", fontSize: 13 }}>{t.name}</div>
              <div style={{ color: "var(--crm-taupe)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em" }}>
                {t.format_support}
              </div>
              <div style={{ color: "var(--crm-taupe)", fontSize: 11 }}>{t.slide_count} slide{t.slide_count === 1 ? "" : "s"}</div>
              <button onClick={() => toggleActive(t.id, !t.active)}
                style={{
                  fontSize: 11, padding: "4px 8px", borderRadius: 4,
                  border: "1px solid var(--crm-border-dark)", cursor: "pointer",
                  background: t.active ? "hsl(120 30% 25%)" : "transparent",
                  color: "var(--crm-warm-white)", letterSpacing: "0.15em", textTransform: "uppercase",
                }}>
                {t.active ? "Active" : "Inactive"}
              </button>
              <button onClick={() => remove(t.id)}
                style={{ background: "transparent", border: "none", color: "var(--crm-taupe)", cursor: "pointer" }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
