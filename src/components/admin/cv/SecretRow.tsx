// Same Settings-card pattern as Briefs.tsx's and Approvals.tsx's own
// SecretRow (each a local copy, per their own comments). This is the one
// place meant to recombine both — the new Settings & keys page (CRE-332
// Phase 5) merges Tokens.tsx with the key sheets from Briefs and Approvals —
// so it is the shared version the others were deliberately not refactored
// into.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// app_secrets isn't in the generated Database type — see Briefs.tsx's own
// comment on this same cast.
const db = supabase as unknown as { from: (table: string) => any };

function randomSecret(len = 40) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, len);
}

export default function SecretRow({
  label, secretKey, placeholder = "", generated, hint,
}: { label: string; secretKey: string; placeholder?: string; generated: boolean; hint: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    db.from("app_secrets").select("value").eq("key", secretKey).maybeSingle()
      .then(({ data }: { data: { value: string } | null }) => { setValue(data?.value ?? null); setLoaded(true); });
  }, [secretKey]);

  const save = async (next: string) => {
    setBusy(true);
    const { error } = await db.from("app_secrets")
      .upsert({ key: secretKey, value: next, rotated_at: new Date().toISOString() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setValue(next);
    setDraft("");
    setRevealed(true);
    toast.success(`${label} saved`);
  };

  const copy = () => { if (value) { navigator.clipboard.writeText(value); toast.success("Copied"); } };

  return (
    <div style={{ display: "grid", gap: 6, marginBottom: 18 }}>
      <label className="crm-label">{label}</label>
      <p style={{ fontSize: 15, color: "hsl(30 8% 62%)", margin: 0 }}>{hint}</p>
      {!loaded ? (
        <div style={{ fontSize: 15, color: "hsl(30 8% 62%)" }}>Loading…</div>
      ) : value ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <code style={{
            flex: 1, fontFamily: "monospace", fontSize: 15, color: "hsl(40 20% 97%)",
            background: "hsl(40 8% 10%)", padding: "8px 10px", border: "1px solid hsl(40 20% 97% / 0.08)",
            wordBreak: "break-all",
          }}>
            {revealed ? value : "•".repeat(Math.min(value.length, 32))}
          </code>
          <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => setRevealed((r) => !r)}>
            {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </button>
          <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={copy}>
            <Copy className="h-3 w-3" />
          </button>
          {generated ? (
            <button className="crm-btn crm-btn--ghost crm-btn--sm" disabled={busy}
              onClick={() => { if (confirm(`Rotate ${label}? Anything using the old value stops working immediately.`)) save(randomSecret()); }}>
              <RefreshCw className="h-3 w-3" /> Rotate
            </button>
          ) : (
            <button className="crm-btn crm-btn--ghost crm-btn--sm" disabled={busy}
              onClick={() => setValue(null)}>
              Replace
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          {generated ? (
            <button className="crm-btn crm-btn--bronze crm-btn--sm" disabled={busy} onClick={() => save(randomSecret())}>
              Generate
            </button>
          ) : (
            <>
              <input className="crm-input" placeholder={placeholder} value={draft}
                onChange={(e) => setDraft(e.target.value)} style={{ flex: 1 }} />
              <button className="crm-btn crm-btn--bronze crm-btn--sm" disabled={busy || !draft.trim()}
                onClick={() => save(draft.trim())}>
                Save
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
