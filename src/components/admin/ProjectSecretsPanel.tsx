import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface SecretRow {
  key: string;
  hint: string | null;
  updated_at: string;
}

const FIELDS: Array<{
  key: "surecontact_api_key" | "surecontact_mcp_url";
  label: string;
  description: string;
  placeholder: string;
  isSecret: boolean;
}> = [
  {
    key: "surecontact_api_key",
    label: "SureContact API Key",
    description:
      "Used for the REST API and MCP authentication. Pulled from the client's SureContact account → API Keys.",
    placeholder: "sk_live_…",
    isSecret: true,
  },
  {
    key: "surecontact_mcp_url",
    label: "SureContact MCP URL",
    description:
      "Per-client MCP endpoint, e.g. https://mcp.surecontact.com/start/menovia-2442qxnu",
    placeholder: "https://mcp.surecontact.com/start/…",
    isSecret: false,
  },
];

export default function ProjectSecretsPanel({ clientProjectId }: { clientProjectId: string }) {
  const [secrets, setSecrets] = useState<Record<string, SecretRow>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("project_secrets")
      .select("key, hint, updated_at")
      .eq("client_project_id", clientProjectId);
    if (error) {
      toast.error(`Failed to load secrets: ${error.message}`);
    } else {
      const map: Record<string, SecretRow> = {};
      (data ?? []).forEach((r) => { map[r.key] = r as SecretRow; });
      setSecrets(map);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [clientProjectId]);

  const save = async (key: string) => {
    const value = (values[key] ?? "").trim();
    if (!value) { toast.error("Enter a value first"); return; }
    setSaving(key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/add-project-secret`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ client_project_id: clientProjectId, key, value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? res.statusText);
      toast.success("Saved");
      setValues((v) => ({ ...v, [key]: "" }));
      await load();
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
          SureContact credentials
        </h3>
        <p style={{ fontSize: 14, color: "hsl(30 8% 50%)" }}>
          Per-project secrets, encrypted at rest. The automation orchestrator uses these to build the
          client's lists, tags, nurture sequence, and landing-page assets in their SureContact account.
        </p>
      </div>

      {FIELDS.map((f) => {
        const existing = secrets[f.key];
        return (
          <div key={f.key} style={{
            border: "1px solid hsl(30 12% 88%)", borderRadius: 8, padding: 16,
            display: "flex", flexDirection: "column", gap: 10, background: "hsl(30 20% 99%)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <Label htmlFor={`secret-${f.key}`} style={{ fontSize: 14, fontWeight: 500 }}>
                {f.label}
              </Label>
              <span style={{ fontSize: 12, color: existing ? "hsl(140 40% 35%)" : "hsl(30 8% 55%)" }}>
                {loading ? "…" : existing
                  ? `Saved · updated ${new Date(existing.updated_at).toLocaleDateString()}`
                  : "Not set"}
              </span>
            </div>
            <p style={{ fontSize: 13, color: "hsl(30 8% 50%)", margin: 0 }}>{f.description}</p>
            <div style={{ display: "flex", gap: 8 }}>
              <Input
                id={`secret-${f.key}`}
                type={f.isSecret ? "password" : "text"}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={existing ? "Enter new value to replace…" : f.placeholder}
                autoComplete="off"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                onClick={() => save(f.key)}
                disabled={saving === f.key || !(values[f.key] ?? "").trim()}
                style={{
                  padding: "0 16px", borderRadius: 6, border: "1px solid hsl(30 12% 30%)",
                  background: "hsl(30 12% 20%)", color: "hsl(30 20% 96%)",
                  cursor: saving === f.key ? "default" : "pointer",
                  opacity: saving === f.key || !(values[f.key] ?? "").trim() ? 0.5 : 1,
                  fontSize: 13,
                }}
              >
                {saving === f.key ? "Saving…" : existing ? "Replace" : "Save"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
