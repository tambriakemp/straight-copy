import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { toast } from "sonner";
import { format } from "date-fns";
import { Trash2, Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Token {
  id: string; label: string; created_at: string; last_used_at: string | null; revoked: boolean;
}

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return "crm_" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function Tokens() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-api`;

  const load = async () => {
    const { data, error } = await supabase
      .from("api_tokens")
      .select("id,label,created_at,last_used_at,revoked")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message); else setTokens((data as Token[]) || []);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!label.trim()) { toast.error("Label required"); return; }
    setBusy(true);
    const raw = generateToken();
    const hash = await sha256(raw);
    const { error } = await supabase.from("api_tokens").insert({ label: label.trim(), token_hash: hash });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRevealed(raw);
    setLabel("");
    load();
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this token? API calls using it will immediately fail.")) return;
    await supabase.from("api_tokens").update({ revoked: true }).eq("id", id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this token permanently?")) return;
    await supabase.from("api_tokens").delete().eq("id", id);
    load();
  };

  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">Integrations</div>
            <h1 className="roster__title">API <em>tokens</em></h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              Bearer tokens for the public REST API. Endpoint:{" "}
              <code style={{ fontFamily: "monospace", fontSize: 14, color: "hsl(40 20% 97%)", background: "hsl(36 5% 16%)", padding: "2px 6px" }}>
                {apiUrl}
              </code>
            </p>
          </div>
        </div>

        <div style={{ background: "hsl(36 5% 16%)", padding: 28, marginBottom: 24, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label className="crm-label">Token label</label>
            <input
              className="crm-input"
              placeholder="e.g. Zapier production"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <button className="crm-btn crm-btn--bronze" onClick={create} disabled={busy}>
            Generate
          </button>
        </div>

        {tokens.length === 0 ? (
          <div className="crm-empty">
            <div className="crm-empty__glyph">∅</div>
            <div className="crm-empty__title">No <em>tokens</em> yet.</div>
            <div className="crm-empty__sub">Generate a token above to use the public REST API.</div>
          </div>
        ) : (
          <>
            <div className="roster__head-row" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1.2fr" }}>
              <div className="roster__col-h" style={{ cursor: "default" }}>Label</div>
              <div className="roster__col-h" style={{ cursor: "default" }}>Created</div>
              <div className="roster__col-h" style={{ cursor: "default" }}>Last used</div>
              <div className="roster__col-h" style={{ cursor: "default" }}>Status</div>
              <div className="roster__col-h" style={{ cursor: "default", justifyContent: "flex-end" }}>Actions</div>
            </div>
            <div className="roster__list">
              {tokens.map((t) => (
                <div
                  key={t.id}
                  className="roster__row"
                  style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1.2fr", cursor: "default" }}
                >
                  <div className="roster__name" style={{ fontSize: 18 }}>{t.label}</div>
                  <div style={{ fontSize: 13, letterSpacing: "0.15em", color: "hsl(30 8% 62%)", textTransform: "uppercase" }}>
                    {format(new Date(t.created_at), "MMM d, yyyy")}
                  </div>
                  <div style={{ fontSize: 13, letterSpacing: "0.15em", color: "hsl(30 8% 62%)", textTransform: "uppercase" }}>
                    {t.last_used_at ? format(new Date(t.last_used_at), "MMM d, HH:mm") : "—"}
                  </div>
                  <div>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
                      color: t.revoked ? "hsl(8 55% 70%)" : "hsl(150 35% 70%)",
                    }}>
                      <span style={{
                        display: "inline-block", width: 8, height: 8, borderRadius: "50%",
                        background: t.revoked ? "hsl(8 55% 55%)" : "hsl(150 30% 55%)",
                      }} />
                      {t.revoked ? "Revoked" : "Active"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                    {!t.revoked && (
                      <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => revoke(t.id)}>
                        Revoke
                      </button>
                    )}
                    <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => remove(t.id)}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
          <DialogContent className="crm-shell !bg-[hsl(36_5%_16%)] !border-[hsl(40_20%_97%/0.08)] !text-[hsl(40_20%_97%)] !rounded-none !max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif italic text-2xl text-[hsl(40_20%_97%)]">Your new token</DialogTitle>
            </DialogHeader>
            <p style={{ fontSize: 15, color: "hsl(30 8% 62%)", margin: "8px 0" }}>
              Copy this now. You won't see it again.
            </p>
            <div style={{
              background: "hsl(40 8% 10%)",
              color: "hsl(40 20% 97%)",
              padding: 14,
              fontFamily: "monospace",
              fontSize: 14,
              wordBreak: "break-all",
              border: "1px solid hsl(40 20% 97% / 0.08)",
            }}>
              {revealed}
            </div>
            <DialogFooter className="mt-2">
              <button
                className="crm-btn crm-btn--bronze"
                onClick={() => { navigator.clipboard.writeText(revealed!); toast.success("Copied"); }}
              >
                <Copy className="h-3 w-3" /> Copy
              </button>
              <button className="crm-btn crm-btn--ghost" onClick={() => setRevealed(null)}>
                Done
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
