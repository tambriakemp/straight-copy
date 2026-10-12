// Profile, API & MCP, and keys — one page, tabs down the left.
//
// They were three destinations (/admin/profile, /admin/tokens with its
// own two tabs, and a More hub pointing at both) for one job: changing
// something about your own account. Three places to look is how a
// setting goes missing, and the Profile page was still in the old dark
// style besides.
//
// The old paths redirect here rather than 404, because they are in
// bookmarks and in every piece of documentation that mentions a key.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import { UserCircle, Plug, KeyRound, Copy, Trash2 } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import PageHeader from "@/components/admin/cv/PageHeader";
import SecretRow from "@/components/admin/cv/SecretRow";
import EmptyState from "@/components/admin/cv/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type Tab = "profile" | "api" | "keys";

const TABS: Array<{ key: Tab; label: string; icon: typeof UserCircle }> = [
  { key: "profile", label: "Profile", icon: UserCircle },
  { key: "api", label: "API & MCP", icon: Plug },
  { key: "keys", label: "Keys", icon: KeyRound },
];

interface Token {
  id: string; label: string; created_at: string; last_used_at: string | null; revoked: boolean;
}
type Template = { uuid: string | null; name: string; subject: string | null; type: string | null };

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function generateToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return "crm_" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const copy = async (text: string, what = "Copied") => {
  try { await navigator.clipboard.writeText(text); toast.success(what); }
  catch { toast.error("Copy failed"); }
};

export default function Settings() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: Tab = raw === "api" || raw === "keys" ? raw : "profile";
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    if (t === "profile") next.delete("tab"); else next.set("tab", t);
    setParams(next, { replace: true });
  };

  return (
    <AdminLayout>
      <div className="cv-admin" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <PageHeader
          eyebrow="Account"
          title="Profile & settings"
          subtitle="Your sign-in, the API and MCP connection, and every key the briefs, prospect approvals and automations need."
        />
        <div className="cv-settings" style={{ padding: "8px 32px 32px" }}>
          <nav className="cv-settings__rail" aria-label="Settings">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  type="button"
                  className={`cv-settings__tab ${tab === t.key ? "cv-settings__tab--on" : ""}`}
                  aria-current={tab === t.key ? "page" : undefined}
                  onClick={() => setTab(t.key)}
                >
                  <Icon size={17} strokeWidth={1.75} />
                  {t.label}
                </button>
              );
            })}
          </nav>

          <div className="cv-settings__body">
            {tab === "profile" && <ProfileTab />}
            {tab === "api" && <ApiTab />}
            {tab === "keys" && <KeysTab />}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

// ---------------------------------------------------------------- Profile

function ProfileTab() {
  const { user } = useAdminAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [loadingTpl, setLoadingTpl] = useState(false);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (password !== confirm) { toast.error("Passwords do not match"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated");
      setPassword(""); setConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update password");
    } finally { setBusy(false); }
  };

  const loadTemplates = async () => {
    setLoadingTpl(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-surecontact-templates");
      if (error) throw error;
      const body = data as { error?: string; templates?: Template[] };
      if (body?.error) throw new Error(body.error);
      setTemplates(body.templates ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load templates");
    } finally { setLoadingTpl(false); }
  };

  return (
    <>
      <section className="cv-card cv-card-pad">
        <div className="cv-card-head"><h2 className="cv-card-title">Signed in as</h2></div>
        <p style={{ margin: 0, fontSize: 16 }}>{user?.email ?? "—"}</p>
      </section>

      <section className="cv-card cv-card-pad">
        <div className="cv-card-head"><h2 className="cv-card-title">Change password</h2></div>
        <form onSubmit={changePassword} style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 420 }}>
          <label className="cv-field">
            New password
            <input className="cv-input" type="password" required minLength={8}
              value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <label className="cv-field">
            Confirm new password
            <input className="cv-input" type="password" required minLength={8}
              value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </label>
          <button type="submit" className="cv-open cv-open--dark"
            style={{ alignSelf: "flex-start", padding: "0 22px" }} disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      </section>

      <section className="cv-card cv-card-pad">
        <div className="cv-card-head">
          <h2 className="cv-card-title">SureContact templates</h2>
          <span style={{ flex: 1 }} />
          <button type="button" className="cv-open" style={{ padding: "0 18px" }}
            onClick={loadTemplates} disabled={loadingTpl}>
            {loadingTpl ? "Loading…" : templates ? "Refresh" : "Load templates"}
          </button>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--cv-muted)" }}>
          Your SureContact email templates and their UUIDs, which are what an
          API-triggered transactional send needs.
        </p>
        {templates && !templates.length && (
          <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>No templates found.</p>
        )}
        {templates?.map((t) => (
          <div key={t.uuid ?? t.name} className="cv-it">
            <span className="cv-it__what">
              <b>{t.name}</b>
              <small>{t.subject || "No subject"}</small>
              <code style={{ fontSize: 12, color: "var(--cv-muted)", overflowWrap: "anywhere" }}>
                {t.uuid ?? "(no uuid)"}
              </code>
            </span>
            <button type="button" className="cv-mini" disabled={!t.uuid}
              onClick={() => t.uuid && copy(t.uuid, "UUID copied")}>
              <Copy size={14} /><span style={{ marginLeft: 6 }}>Copy</span>
            </button>
          </div>
        ))}
      </section>
    </>
  );
}

// ------------------------------------------------------------- API & MCP

function ApiTab() {
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
    if (error) toast.error(error.message); else setTokens((data as Token[]) ?? []);
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!label.trim()) { toast.error("Give the token a label"); return; }
    setBusy(true);
    const token = generateToken();
    const hash = await sha256(token);
    const { error } = await supabase.from("api_tokens").insert({ label: label.trim(), token_hash: hash });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    // Shown once. Only the hash is stored, so there is no second chance
    // to read it — which is the point, and has to be said out loud.
    setRevealed(token);
    setLabel("");
    void load();
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this token? API calls using it will immediately fail.")) return;
    await supabase.from("api_tokens").update({ revoked: true }).eq("id", id);
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this token permanently?")) return;
    await supabase.from("api_tokens").delete().eq("id", id);
    void load();
  };

  return (
    <>
      <section className="cv-card cv-card-pad">
        <div className="cv-card-head"><h2 className="cv-card-title">MCP connection</h2></div>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--cv-muted)" }}>
          Connect Claude, or any MCP client, to manage the board in conversation.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 14 }}>
          <code className="cv-code">{mcpUrl}</code>
          <button type="button" className="cv-mini" onClick={() => copy(mcpUrl)}>
            <Copy size={14} /><span style={{ marginLeft: 6 }}>Copy</span>
          </button>
        </div>
        <div style={{ fontSize: 14, color: "var(--cv-muted)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--cv-ink)", fontWeight: 500 }}>How to connect in Claude</strong>
          <ol style={{ paddingLeft: 20, margin: "6px 0 0" }}>
            <li>Claude.ai → Settings → Connectors</li>
            <li>Add custom connector</li>
            <li>Paste the URL above</li>
            <li>Sign in with your admin credentials when prompted</li>
            <li>Approve access — the board tools appear in chat</li>
          </ol>
          <p style={{ margin: "12px 0 0" }}>
            OAuth sessions are tied to your admin account. Revoke access by deleting
            tokens below.
          </p>
        </div>
      </section>

      <section className="cv-card cv-card-pad">
        <div className="cv-card-head"><h2 className="cv-card-title">API tokens</h2></div>
        <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--cv-muted)" }}>
          Bearer tokens for the public REST API.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <code className="cv-code">{apiUrl}</code>
          <button type="button" className="cv-mini" onClick={() => copy(apiUrl)}>
            <Copy size={14} /><span style={{ marginLeft: 6 }}>Copy</span>
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 }}>
          <label className="cv-field" style={{ flex: "1 1 240px" }}>
            Token label
            <input className="cv-input" placeholder="e.g. Zapier production"
              value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 20px" }}
            onClick={create} disabled={busy}>
            {busy ? "Generating…" : "Generate"}
          </button>
        </div>

        {!tokens.length ? (
          <EmptyState title="No tokens yet" subtitle="Generate one above to use the public REST API." />
        ) : tokens.map((t) => (
          <div key={t.id} className="cv-it">
            <span className="cv-it__what">
              <b>{t.label}</b>
              <small>
                Created {format(new Date(t.created_at), "MMM d, yyyy")}
                {" · "}
                {t.last_used_at ? `last used ${format(new Date(t.last_used_at), "MMM d, HH:mm")}` : "never used"}
              </small>
            </span>
            <span className={`cv-chip ${t.revoked ? "cv-chip--red" : "cv-chip--green"}`}>
              {t.revoked ? "Revoked" : "Active"}
            </span>
            {!t.revoked && (
              <button type="button" className="cv-mini" onClick={() => revoke(t.id)}>Revoke</button>
            )}
            <button type="button" className="cv-mini cv-mini--danger" onClick={() => remove(t.id)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </section>

      <Dialog open={!!revealed} onOpenChange={(o) => !o && setRevealed(null)}>
        <DialogContent data-mobile-bottom-sheet="true" className="sm:max-w-md">
          <DialogHeader><DialogTitle>Your new token</DialogTitle></DialogHeader>
          <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
            Copy it now. Only a hash of it is stored, so this is the one time
            it can be read.
          </p>
          <code className="cv-code" style={{ display: "block" }}>{revealed}</code>
          <DialogFooter>
            <button type="button" className="cv-open" style={{ padding: "0 18px" }}
              onClick={() => setRevealed(null)}>Done</button>
            <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 18px" }}
              onClick={() => revealed && copy(revealed)}>
              <Copy size={14} style={{ marginRight: 6 }} /> Copy
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ------------------------------------------------------------------ Keys

function KeysTab() {
  return (
    <section className="cv-card cv-card-pad">
      <div className="cv-card-head"><h2 className="cv-card-title">Keys</h2></div>
      <p style={{ margin: "0 0 4px", fontSize: 14, color: "var(--cv-muted)" }}>
        Generated and rotated here — never in Supabase or Lovable. Every key the
        briefs, prospect approvals and automations need, in one place.
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
        hint="The same Grok Bot agent-stuck webhook URL already wired into every agent's AGENTS.md (CRE-310). Checking off a brief or Needs-you-now item, and every Decide button (CRE-393), posts here instead of telling Ara in chat."
      />
      <SecretRow
        label="Ara webhook key" secretKey="ara_webhook_key" placeholder="paste the bearer token"
        generated={false}
        hint="The bearer token that goes with the webhook URL above."
      />
      <SecretRow
        label="Prospect approvals ingest key" secretKey="prospect_approvals_ingest_secret" generated
        hint="Save this as a Paperclip secret named PROSPECT-APPROVALS-INGEST-KEY — Ara adds it to Nicole's env from there. Rotating breaks her pushes and decision reads until she has the new value."
      />
      <SecretRow
        label="Paperclip board key (project task sync)" secretKey="paperclip_board_api_key"
        placeholder="paste the board API key from POST /api/board-api-keys"
        generated={false}
        hint="Board-wide Paperclip API key (not an agent key, and there's no Paperclip UI page for minting these yet — create with POST /api/board-api-keys) used by the hourly sync-paperclip-project-tasks edge function to pull task counts for every linked client project. Rotating breaks that hourly sync until the new value is saved here."
      />
      <SecretRow
        label="Audit upload key" secretKey="audit_upload_key" generated
        hint="Paste this into Devin's secure secret form as AUDIT_UPLOAD_SECRET — the site-audit tool on the VPS sends it with every report it publishes to /audit/<slug> (CRE-225). Rotating breaks publishing until Devin has the new value; nothing already published is affected."
      />
      <SecretRow
        label="GitHub token (Decide → Merge)" secretKey="github_token" placeholder="paste a fine-grained PAT"
        generated={false}
        hint="CRE-393: used only by the decide-action edge function to check CI and merge a PR when you pick 'Merge' on a Decide card. Needs Contents: write and Pull requests: write on at least tambriakemp/straight-copy (add atelemed/menovia or others only if you want Merge wired for those repos too). Without this set, Merge buttons report the error and don't touch GitHub."
      />
    </section>
  );
}
