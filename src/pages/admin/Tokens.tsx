import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import PageHeader from "@/components/admin/cv/PageHeader";
import DarkEmbed from "@/components/admin/cv/DarkEmbed";
import SecretRow from "@/components/admin/cv/SecretRow";
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

type CvTab = "api" | "keys";

export default function Tokens() {
  const [cvTab, setCvTab] = useState<CvTab>("api");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-api`;
  const mcpUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agency-mcp`;

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

  const revealDialog = (
    <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
      <DialogContent className="crm-shell !bg-[hsl(36_5%_16%)] !border-[hsl(40_20%_97%/0.08)] !text-[hsl(40_20%_97%)] !rounded-none !max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif italic text-2xl text-[hsl(40_20%_97%)]">Your new token</DialogTitle>
        </DialogHeader>
        <p style={{ fontSize: 19, color: "hsl(30 8% 62%)", margin: "8px 0" }}>
          Copy this now. You won't see it again.
        </p>
        <div style={{
          background: "hsl(40 8% 10%)",
          color: "hsl(40 20% 97%)",
          padding: 14,
          fontFamily: "monospace",
          fontSize: 18,
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
  );

  const apiAndMcpSection = (
    <>
      {/* ── MCP Connection ── */}
      <div style={{ background: "hsl(36 5% 16%)", padding: 28, marginBottom: 24 }}>
        <h2 className="font-serif italic text-xl" style={{ color: "hsl(40 20% 97%)", marginBottom: 4 }}>MCP Connection</h2>
        <p style={{ fontSize: 19, color: "hsl(30 8% 62%)", marginBottom: 20 }}>
          Connect Claude or any MCP client to manage tasks via natural language.
        </p>

        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <label className="crm-label">MCP Server URL</label>
            <div style={{ display: "flex", gap: 8 }}>
              <code
                style={{
                  flex: 1,
                  fontFamily: "monospace", fontSize: 17,
                  color: "hsl(40 20% 97%)", background: "hsl(40 8% 10%)",
                  padding: "10px 12px", border: "1px solid hsl(40 20% 97% / 0.08)",
                  wordBreak: "break-all",
                }}
              >
                {mcpUrl}
              </code>
              <button
                className="crm-btn crm-btn--ghost crm-btn--sm"
                onClick={() => { navigator.clipboard.writeText(mcpUrl); toast.success("Copied"); }}
              >
                <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div style={{ fontSize: 18, color: "hsl(30 8% 62%)", lineHeight: 1.6 }}>
            <p style={{ marginBottom: 8 }}><strong style={{ color: "hsl(40 20% 97%)" }}>How to connect in Claude:</strong></p>
            <ol style={{ paddingLeft: 20, margin: 0 }}>
              <li>Open <em>Claude.ai</em> → Settings → Connectors</li>
              <li>Click "Add custom connector"</li>
              <li>Paste the MCP Server URL above</li>
              <li>Sign in with your admin credentials when prompted</li>
              <li>Approve access — your task tools will appear in chat</li>
            </ol>
          </div>

          <div style={{
            fontSize: 17, color: "hsl(30 8% 52%)",
            borderTop: "1px solid hsl(40 20% 97% / 0.06)",
            paddingTop: 12,
          }}>
            OAuth sessions are tied to your admin account. Revoke access by deleting tokens below.
          </div>
        </div>
      </div>

      {/* ── API Tokens ── */}
      <div style={{ background: "hsl(36 5% 16%)", padding: 28, marginBottom: 24 }}>
        <h2 className="font-serif italic text-xl" style={{ color: "hsl(40 20% 97%)", marginBottom: 4 }}>API Tokens</h2>
        <p style={{ fontSize: 19, color: "hsl(30 8% 62%)", marginBottom: 20 }}>
          Bearer tokens for the public REST API. Endpoint:{" "}
          <code style={{ fontFamily: "monospace", fontSize: 17, color: "hsl(40 20% 97%)", background: "hsl(40 8% 10%)", padding: "2px 6px" }}>
            {apiUrl}
          </code>
        </p>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 24 }}>
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
                  <div className="roster__name" style={{ fontSize: 22 }}>{t.label}</div>
                  <div style={{ fontSize: 17, letterSpacing: "0.15em", color: "hsl(30 8% 62%)", textTransform: "uppercase" }}>
                    {format(new Date(t.created_at), "MMM d, yyyy")}
                  </div>
                  <div style={{ fontSize: 17, letterSpacing: "0.15em", color: "hsl(30 8% 62%)", textTransform: "uppercase" }}>
                    {t.last_used_at ? format(new Date(t.last_used_at), "MMM d, HH:mm") : "—"}
                  </div>
                  <div>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 8,
                      fontSize: 16, letterSpacing: "0.2em", textTransform: "uppercase",
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
      </div>
    </>
  );

  return (
    <AdminLayout>
      <div className="cv-admin" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <PageHeader
          eyebrow="Workspace / Settings"
          title="Settings & keys"
          subtitle="API tokens, MCP connection settings, and every key the briefs, prospect approvals, and automations need."
        />
        <div className="cv-tabs" style={{ padding: "0 32px" }}>
          <button type="button" className={`cv-tab${cvTab === "api" ? " cv-tab--active" : ""}`} onClick={() => setCvTab("api")}>API &amp; MCP</button>
          <button type="button" className={`cv-tab${cvTab === "keys" ? " cv-tab--active" : ""}`} onClick={() => setCvTab("keys")}>Keys</button>
        </div>

        <div style={{ padding: "0 32px 32px" }}>
          {cvTab === "api" ? (
            apiAndMcpSection
          ) : (
            <DarkEmbed style={{ padding: 28 }}>
              <h2 className="font-serif italic text-xl" style={{ color: "hsl(40 20% 97%)", marginBottom: 4 }}>Keys</h2>
              <p style={{ fontSize: 15, color: "hsl(30 8% 62%)", marginBottom: 20 }}>
                Generated and rotated here — never in Supabase or Lovable. Moved from the Today and Prospects pages'
                own Settings sheets so every key lives in one place.
              </p>
              <SecretRow
                label="Brief ingest key" secretKey="briefs_ingest_secret" generated
                hint="Paste this into Ara's secure secret form as BRIEFS_INGEST_SECRET. Rotating breaks Ara's posts until she has the new value — briefs fall back to full chat messages in the meantime, nothing is lost."
              />
              <SecretRow
                label="Paperclip read key" secretKey="paperclip_read_token" placeholder="paste the key minted on your agent page"
                generated={false}
                hint="Mint on your Paperclip agent page (Settings → API Keys → New key, scope Standard, name briefs-sync-reader) and paste the one-time value here. Never paste it anywhere else — not Supabase, not Lovable chat. Also used to post the 'marked done from the brief' comment when you check off an item tied to a Paperclip issue (CRE-335)."
              />
              <SecretRow
                label="Bree's Paperclip user ID" secretKey="paperclip_bree_user_id" placeholder="paste Bree's Paperclip user id"
                generated={false}
                hint="So the sync can pull Bree's personal inbox, not just company-wide approvals. Find it on her Paperclip profile."
              />
              <SecretRow
                label="Ara webhook URL" secretKey="ara_webhook_url" placeholder="https://…"
                generated={false}
                hint="The same Grok Bot agent-stuck webhook URL already wired into every agent's AGENTS.md (CRE-310). Checking off a brief or Needs-you-now item posts here instead of telling Ara in chat."
              />
              <SecretRow
                label="Ara webhook key" secretKey="ara_webhook_key" placeholder="paste the bearer key"
                generated={false}
                hint="The bearer key that goes with the webhook URL above."
              />
              <SecretRow
                label="Prospect approvals ingest key" secretKey="prospect_approvals_ingest_secret" generated
                hint="Save this as a Paperclip secret named PROSPECT-APPROVALS-INGEST-KEY — Ara adds it to Nicole's env from there. Rotating breaks her pushes and decision reads until she has the new value."
              />
            </DarkEmbed>
          )}
        </div>
      </div>
      {revealDialog}
    </AdminLayout>
  );
}
