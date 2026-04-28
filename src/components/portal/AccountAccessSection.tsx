import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const PUB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type AccountChecks = Record<string, boolean>;
type FileEntry = { path: string; name: string; size: number };
type AccountFields = Record<string, string>;
export type AccountAccessState = {
  checks?: AccountChecks;
  notes?: string;
  files?: FileEntry[];
  fields?: AccountFields;
  submitted_at?: string | null;
  updated_at?: string;
};

const ACCOUNTS_BASE: Array<{
  key: string;
  label: string;
  desc: ReactNode;
  growthOnly?: boolean;
}> = [
  {
    key: "surecontact",
    label: "SureContact",
    desc: (
      <>
        This is where all your email sequences and client communications will live. You can sign up{" "}
        <a
          href="https://surecontact.com/?aff=63f97d32"
          target="_blank"
          rel="noreferrer"
          className="portal-access__link"
        >
          here
        </a>
        . As of right now, they're offering a limited-time lifetime deal — no monthly platform fee, just a one-time payment. You'll only pay for the emails you actually send, not for housing your contacts. Once you've signed up, click <strong>Members</strong> and add{" "}
        <a href="mailto:info@cre8visions.com" className="portal-access__link">
          info@cre8visions.com
        </a>{" "}
        as a member. When that's done, check this item off so the team knows it's complete.
      </>
    ),
  },
  {
    key: "ottokit",
    label: "Ottokit",
    desc: (
      <>
        This is where all your automations and workflows will be built and managed. You can sign up{" "}
        <a
          href="https://ottokit.com/?aff=e14f4e4e"
          target="_blank"
          rel="noreferrer"
          className="portal-access__link"
        >
          here
        </a>
        . We strongly recommend the <strong>Business Lifetime</strong> plan — it includes the{" "}
        <strong>Human in the Loop</strong> feature, which lets you verify automations and emails before they're sent. Ottokit also offers a payment plan for the lifetime deal, so you don't have to pay it all at once. Once you've signed up, invite{" "}
        <a href="mailto:info@cre8visions.com" className="portal-access__link">
          info@cre8visions.com
        </a>{" "}
        to your workspace, then check this item off so the team knows it's complete.
      </>
    ),
  },
  {
    key: "copost",
    label: "CoPost",
    desc: (
      <>
        This is your social media content scheduler — where all your linked social accounts live so content can be published through your automations. You can sign up{" "}
        <a
          href="https://copost.com"
          target="_blank"
          rel="noreferrer"
          className="portal-access__link"
        >
          here
        </a>
        . CoPost is currently offering a lifetime deal — we recommend the <strong>Teams</strong> plan (also a one-time payment) so the whole team can collaborate. Once you've signed up, click <strong>Settings → Team</strong> and add{" "}
        <a href="mailto:info@cre8visions.com" className="portal-access__link">
          info@cre8visions.com
        </a>{" "}
        as a team member. Then click <strong>Socials</strong> and connect up to four social media accounts. <em>Note: for Launch plans, YouTube is not included.</em> Once your accounts are connected, check this item off so the team knows it's complete. If you already use a different content scheduler and want to keep it, email us first to see if we can integrate with it.
      </>
    ),
  },
  {
    key: "website",
    label: "Website Access",
    desc: (
      <>
        We'll need access to your website so we can connect your lead capture system and any on-site automations. Log in to your website's admin dashboard and add{" "}
        <a href="mailto:info@cre8visions.com" className="portal-access__link">
          info@cre8visions.com
        </a>{" "}
        as a user, then grant <strong>Editor</strong> or <strong>Admin</strong> rights (Admin is preferred so we can install and configure everything we need). Once that's done, check this item off so the team knows it's complete.
      </>
    ),
  },
  {
    key: "heygen",
    label: "HeyGen",
    desc: (
      <>
        This is where your AI avatar will be created and managed. Once you've set up your HeyGen account, please paste your <strong>API key</strong> in the field below and click <strong>Save</strong> so we can connect it to your automations.
        <br /><br />
        <em>Prefer to use an MCP server instead?</em> Check the box below. Going the MCP route is the most cost-effective option because it doesn't require purchasing API credits — but it does require a <strong>dedicated computer</strong> that can run the automation. The computer will need to be powered on at least <strong>once a month</strong> for the automation to run. If you check the MCP box, the API key field will hide.
        <br /><br />
        Once you've either saved your API key or selected MCP, check this item off so the team knows it's complete.
      </>
    ),
    growthOnly: true,
  },
  { key: "claude", label: "Claude Account", desc: "This is where your Business Brain will live. A Pro account is required.", growthOnly: true },
];

const SOCIAL_PLATFORMS = [
  { key: "social_instagram", label: "Instagram" },
  { key: "social_tiktok", label: "TikTok" },
  { key: "social_linkedin", label: "LinkedIn" },
  { key: "social_facebook", label: "Facebook" },
  { key: "social_youtube", label: "YouTube" },
];

export default function AccountAccessSection({
  clientId,
  tier,
  initial,
}: {
  clientId: string;
  tier: string;
  initial: AccountAccessState;
}) {
  const isGrowth = tier === "growth";
  const accounts = useMemo(() => ACCOUNTS_BASE.filter((a) => !a.growthOnly || isGrowth), [isGrowth]);

  const [open, setOpen] = useState(true);
  const [checks, setChecks] = useState<AccountChecks>(initial?.checks ?? {});
  const [notes, setNotes] = useState<string>(initial?.notes ?? "");
  const [files, setFiles] = useState<FileEntry[]>(initial?.files ?? []);
  const [fields, setFields] = useState<AccountFields>(initial?.fields ?? {});
  const [heygenKeyDraft, setHeygenKeyDraft] = useState<string>(initial?.fields?.heygen_api_key ?? "");
  const [submittedAt, setSubmittedAt] = useState<string | null>(initial?.submitted_at ?? null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | null>(null);

  // Required keys (account-level only — social_media counts when at least one sub is checked)
  const requiredKeys = useMemo(() => {
    const k = ["surecontact", "ottokit", "copost", "website"];
    if (isGrowth) k.push("heygen", "claude");
    return k;
  }, [isGrowth]);

  const allDone = requiredKeys.every((k) => !!checks[k]);
  const completedCount = requiredKeys.filter((k) => !!checks[k]).length;

  // Auto-save (debounced) on any change
  useEffect(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persist();
    }, 600);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks, notes, files, fields]);

  const persist = async () => {
    setSaving(true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/brand-kit-intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${PUB_KEY}` },
        body: JSON.stringify({
          clientId,
          action: "account-access-save",
          accountAccess: { checks, notes, files, fields },
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || "Save failed");
      setSubmittedAt(data.accountAccess?.submitted_at ?? null);
    } catch (e) {
      console.error("[account-access] save failed", e);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: string) => {
    setChecks((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // If toggling off social_media, also clear sub-checks visually
      return next;
    });
  };

  const toggleSocial = (subKey: string) => {
    setChecks((prev) => {
      const next = { ...prev, [subKey]: !prev[subKey] };
      // Auto-set parent based on any sub being checked
      const anySocial = SOCIAL_PLATFORMS.some((p) => (p.key === subKey ? next[subKey] : next[p.key]));
      next.social_media = anySocial;
      return next;
    });
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const remaining = Math.max(0, 10 - files.length);
    if (remaining === 0) {
      toast.error("You can attach up to 10 files.");
      return;
    }
    setUploading(true);
    try {
      const newEntries: FileEntry[] = [];
      const toUpload = Array.from(fileList).slice(0, remaining);
      for (const file of toUpload) {
        if (file.size > 15 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 15MB and was skipped.`);
          continue;
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
        const path = `account-access/${clientId}/${Date.now()}-${safeName}`;
        const { error } = await supabase.storage.from("client-assets").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });
        if (error) {
          console.error("upload error", error);
          toast.error(`Failed to upload ${file.name}`);
          continue;
        }
        newEntries.push({ path, name: file.name, size: file.size });
      }
      if (newEntries.length) {
        setFiles((prev) => [...prev, ...newEntries]);
        toast.success(`${newEntries.length} file${newEntries.length > 1 ? "s" : ""} uploaded`);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeFile = (path: string) => {
    setFiles((prev) => prev.filter((f) => f.path !== path));
  };

  return (
    <section className={`portal-access ${open ? "is-open" : "is-closed"}`}>
      <button
        type="button"
        className="portal-access__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="portal-access__toggle-left">
          <div className="portal-access__eyebrow">Node 01 · Intake</div>
          <h2 className="portal-access__title">
            Set Up Your <em>Accounts</em>.
          </h2>
        </div>
        <div className="portal-access__toggle-right">
          <span className={`portal-access__status ${allDone ? "is-done" : ""}`}>
            {allDone
              ? "All set"
              : `${completedCount} of ${requiredKeys.length} complete`}
          </span>
          <span className={`portal-access__chev ${open ? "is-open" : ""}`}>›</span>
        </div>
      </button>

      {open && (
        <div className="portal-access__body">
          <p className="portal-access__intro">
            Before we start building your AI OS, we need a few things set up on your end. Don't worry —
            we'll guide you through each one. These are the accounts and tools your system will run on.
            Everything we build lives in your accounts so you own it all.
          </p>

          <ul className="portal-access__list">
            {accounts.map((a) => {
              const isSocial = a.key === "social_media";
              const checked = !!checks[a.key];
              return (
                <li key={a.key} className={`portal-access__item ${checked ? "is-done" : ""}`}>
                  <label className="portal-access__row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(a.key)}
                      className="portal-access__cb"
                    />
                    <div className="portal-access__copy">
                      <span className="portal-access__lbl">{a.label}</span>
                      <span className="portal-access__desc">{a.desc}</span>
                    </div>
                  </label>

                  {isSocial && (
                    <div className="portal-access__subs">
                      {SOCIAL_PLATFORMS.map((p) => (
                        <label key={p.key} className="portal-access__sub">
                          <input
                            type="checkbox"
                            checked={!!checks[p.key]}
                            onChange={() => toggleSocial(p.key)}
                          />
                          <span>{p.label}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {a.key === "heygen" && (
                    <div className="portal-access__subs" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <label className="portal-access__sub">
                        <input
                          type="checkbox"
                          checked={!!checks.heygen_use_mcp}
                          onChange={() =>
                            setChecks((prev) => ({ ...prev, heygen_use_mcp: !prev.heygen_use_mcp }))
                          }
                        />
                        <span>I prefer to use an MCP server (no API key needed)</span>
                      </label>

                      {!checks.heygen_use_mcp && (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <input
                            type="text"
                            className="portal-access__textarea"
                            style={{ flex: 1, minWidth: 220, padding: "8px 12px", fontFamily: "monospace", fontSize: 13 }}
                            placeholder="Paste your HeyGen API key…"
                            value={heygenKeyDraft}
                            onChange={(e) => setHeygenKeyDraft(e.target.value)}
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <button
                            type="button"
                            className="crm-btn crm-btn--bronze crm-btn--sm"
                            onClick={() =>
                              setFields((prev) => ({ ...prev, heygen_api_key: heygenKeyDraft.trim() }))
                            }
                            disabled={!heygenKeyDraft.trim() || heygenKeyDraft.trim() === fields.heygen_api_key}
                          >
                            {fields.heygen_api_key && fields.heygen_api_key === heygenKeyDraft.trim() ? "Saved" : "Save"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="portal-access__divider" />

          <div className="portal-access__share">
            <h3 className="portal-access__sub-title">
              Share Your <em>Access</em>.
            </h3>
            <p className="portal-access__intro">
              Once your accounts are set up, use the options below to share access with us. Never share
              passwords directly — instead add{" "}
              <a href="mailto:hello@cre8visions.com" className="portal-access__link">
                hello@cre8visions.com
              </a>{" "}
              as a team member or admin on each platform where that option exists. For platforms that
              don't have team access, use the secure note field below to share what we need.
            </p>

            <label className="portal-access__field-label">Secure notes</label>
            <textarea
              className="portal-access__textarea"
              placeholder="Anything we should know about your accounts, special access notes, or platforms without team invites…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              maxLength={4000}
            />

            <label className="portal-access__field-label">Attachments</label>
            <div className="portal-access__upload">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={(e) => handleFiles(e.target.files)}
                disabled={uploading || files.length >= 10}
                className="portal-access__file"
              />
              <span className="portal-access__upload-hint">
                {uploading ? "Uploading…" : "Up to 10 files · 15MB each"}
              </span>
            </div>

            {files.length > 0 && (
              <ul className="portal-access__files">
                {files.map((f) => (
                  <li key={f.path} className="portal-access__file-row">
                    <span className="portal-access__file-name">{f.name}</span>
                    <button
                      type="button"
                      className="portal-access__file-remove"
                      onClick={() => removeFile(f.path)}
                      aria-label={`Remove ${f.name}`}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="portal-access__footer">
            <span className="portal-access__save">
              {saving ? "Saving…" : submittedAt ? `Submitted · ${new Date(submittedAt).toLocaleDateString()}` : "Auto-saved"}
            </span>
            {allDone && (
              <span className="portal-access__badge">✓ Submitted to your CRE8 team</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
