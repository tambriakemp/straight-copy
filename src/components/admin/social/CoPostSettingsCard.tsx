import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Row { key: string; hint: string | null; updated_at: string }

const FIELDS = [
  { key: "copost_endpoint_url", label: "CoPost Trigger URL", placeholder: "https://api.copost.io/triggers/…", isSecret: false,
    description: "The per-project CoPost trigger URL. Approved posts are POSTed here. Found in the client's CoPost workspace under Triggers." },
] as const;

export default function CoPostSettingsCard({ clientProjectId }: { clientProjectId: string }) {
  const [secrets, setSecrets] = useState<Record<string, Row>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("project_secrets")
      .select("key, hint, updated_at")
      .eq("client_project_id", clientProjectId)
      .in("key", FIELDS.map((f) => f.key));
    if (error) { toast.error(error.message); return; }
    const map: Record<string, Row> = {};
    (data ?? []).forEach((r) => { map[r.key] = r as Row; });
    setSecrets(map);
  };

  useEffect(() => { void load(); }, [clientProjectId]);

  const save = async (key: string) => {
    const value = (values[key] ?? "").trim();
    if (!value) { toast.error("Enter a value first"); return; }
    if (key === "copost_endpoint_url") {
      try {
        const u = new URL(value);
        if (u.protocol !== "https:") { toast.error("URL must use https://"); return; }
        if (!u.host.endsWith("copost.io")) { toast.error("URL must be on the copost.io domain"); return; }
      } catch {
        toast.error("Enter a valid URL (e.g. https://api.copost.io/triggers/…)");
        return;
      }
    }
    setSaving(key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/add-project-secret`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ client_project_id: clientProjectId, key, value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? res.statusText);
      toast.success("Saved");
      setValues((v) => ({ ...v, [key]: "" }));
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 500, color: "hsl(30 12% 20%)", marginBottom: 4 }}>
          CoPost credentials
        </h3>
        <p style={{ fontSize: 14, color: "hsl(30 8% 50%)" }}>
          Used by the Social tab to publish approved posts and carousels to the client's CoPost account.
        </p>
      </div>
      {FIELDS.map((f) => {
        const saved = secrets[f.key];
        return (
          <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Label>{f.label}</Label>
            <p style={{ fontSize: 13, color: "hsl(30 8% 50%)" }}>{f.description}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <Input
                type={f.isSecret ? "password" : "text"}
                placeholder={saved ? "•••••• (set)" : f.placeholder}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              <Button onClick={() => save(f.key)} disabled={saving === f.key}>
                {saving === f.key ? "Saving…" : saved ? "Update" : "Save"}
              </Button>
            </div>
            {saved && (
              <span style={{ fontSize: 12, color: "hsl(30 8% 50%)" }}>
                Last updated {new Date(saved.updated_at).toLocaleString()}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
