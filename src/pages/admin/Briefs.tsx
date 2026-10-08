import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, RefreshCw, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useNeedsYouNow } from "@/lib/needsYouNow";
import { useBriefItemCompletions } from "@/lib/briefItemCompletions";
import BriefCheckItem from "@/components/admin/cv/BriefCheckItem";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";

// briefs, paperclip_pending_items and app_secrets aren't in the generated
// Database type yet — Lovable regenerates src/integrations/supabase/types.ts
// from the live schema once it applies this migration (see CLAUDE.md, "New
// columns are not in types.ts until it is regenerated"). Cast narrowly here
// rather than hand-editing that 4,600-line generated file from a PR branch.
const db = supabase as unknown as { from: (table: string) => any };

// `id`/`issue` are optional (CRE-335) — see src/lib/briefs.ts.
interface BriefItem { id?: string; issue?: string | null; text: string; link: string | null }
interface BriefSection { heading: string; items: BriefItem[] }
interface Brief {
  id: string; period: string; title: string; sections: BriefSection[];
  created_at: string; delivered_to_chat: boolean;
}
function randomSecret(len = 40) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, len);
}

// Same fallback id used on the Today page (CRE-335 §3): the ingest
// routine's own `id` once it sends one, otherwise a key scoped to this one
// brief instance.
function briefItemId(briefId: string, sectionIdx: number, itemIdx: number, item: BriefItem): string {
  return item.id ?? `${briefId}:${sectionIdx}:${itemIdx}`;
}
function briefItemIssue(item: BriefItem): string | null {
  if (item.issue) return item.issue;
  const m = item.link?.match(/\/issues\/([A-Z]+-\d+)/);
  return m ? m[1] : null;
}

function SecretRow({
  label, secretKey, placeholder, generated, hint,
}: { label: string; secretKey: string; placeholder: string; generated: boolean; hint: string }) {
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

export default function Briefs() {
  const [briefs, setBriefs] = useState<Brief[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Shared with the Today page (CRE-332 Phase 2) so both read the same
  // Paperclip-items-plus-prospect-batches-plus-... logic instead of two
  // copies drifting apart.
  const { items: combinedPending } = useNeedsYouNow();
  // Shared checkbox state (CRE-335) — see src/lib/briefItemCompletions.ts.
  const { isDone, complete, undo } = useBriefItemCompletions();

  const load = async () => {
    const { data, error } = await db.from("briefs").select("*").order("created_at", { ascending: false }).limit(30);
    if (error) { toast.error(error.message); return; }
    const rows = (data ?? []) as Brief[];
    setBriefs(rows);
    if (rows.length && !selected) setSelected(rows[0].id);
  };
  useEffect(() => { load(); }, []);

  const current = briefs?.find((b) => b.id === selected) ?? briefs?.[0] ?? null;

  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">Daily operations</div>
            <h1 className="roster__title">Briefs</h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              The morning and evening brief, and everything open that needs you right now.{" "}
              <Link to="/admin/audits" style={{ color: "hsl(40 20% 97%)" }}>Client passwords →</Link>
            </p>
          </div>
          <button
            type="button"
            className="crm-btn crm-btn--ghost crm-btn--sm"
            style={{ alignSelf: "flex-start" }}
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        <div style={{ background: "hsl(36 5% 16%)", padding: 28, marginBottom: 24 }}>
          <h2 className="font-serif italic text-xl" style={{ color: "hsl(40 20% 97%)", marginBottom: 4 }}>Needs you now</h2>
          <p style={{ fontSize: 17, color: "hsl(30 8% 62%)", marginBottom: 16 }}>
            Open Paperclip approvals and questions, synced every 10 minutes.
          </p>
          {!combinedPending ? (
            <div style={{ fontSize: 16, color: "hsl(30 8% 62%)" }}>Loading…</div>
          ) : !combinedPending.length ? (
            <div className="crm-empty">
              <div className="crm-empty__glyph">✓</div>
              <div className="crm-empty__title">Nothing <em>waiting</em>.</div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {combinedPending.map((p) => (
                <div key={p.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "10px 12px", background: "hsl(40 8% 10%)",
                  border: "1px solid hsl(40 20% 97% / 0.08)",
                }}>
                  <BriefCheckItem
                    done={isDone(p.id)}
                    borderColor="hsl(40 20% 97% / 0.25)"
                    mutedColor="hsl(30 8% 62%)"
                    onComplete={() => complete({ item_id: p.id, item_text: p.title, issue_identifier: p.issue_identifier })}
                    onUndo={() => undo(p.id)}
                  >
                    <a href={p.issue_url ?? "#"} target="_blank" rel="noreferrer"
                      style={{
                        display: "flex", justifyContent: "space-between", gap: 12,
                        color: "hsl(40 20% 97%)", textDecoration: "none", fontSize: 16,
                      }}>
                      <span>{p.title}</span>
                      <span style={{ color: "hsl(30 8% 62%)", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        {p.kind}{p.issue_identifier ? ` · ${p.issue_identifier}` : ""}
                      </span>
                    </a>
                  </BriefCheckItem>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, marginBottom: 24 }}>
          <div style={{ background: "hsl(36 5% 16%)", padding: "16px 0" }}>
            <div style={{ padding: "0 16px 10px", fontSize: 14, letterSpacing: "0.2em", textTransform: "uppercase", color: "hsl(30 8% 62%)" }}>
              History
            </div>
            {!briefs?.length ? (
              <div style={{ padding: "0 16px", fontSize: 15, color: "hsl(30 8% 62%)" }}>No briefs yet.</div>
            ) : briefs.map((b) => (
              <button key={b.id} onClick={() => setSelected(b.id)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "9px 16px",
                  background: b.id === current?.id ? "hsl(40 8% 10%)" : "transparent",
                  border: "none", color: "hsl(40 20% 97%)", cursor: "pointer", fontSize: 16,
                }}>
                <div>{b.title}</div>
                <div style={{ fontSize: 13, color: "hsl(30 8% 62%)" }}>
                  {new Date(b.created_at).toLocaleString()}
                </div>
              </button>
            ))}
          </div>

          <div style={{ background: "hsl(36 5% 16%)", padding: 28 }}>
            {!current ? (
              <div className="crm-empty">
                <div className="crm-empty__glyph">∅</div>
                <div className="crm-empty__title">No <em>brief</em> yet.</div>
                <div className="crm-empty__sub">Ara's next scheduled run posts here.</div>
              </div>
            ) : (
              <>
                <h2 className="font-serif italic text-2xl" style={{ color: "hsl(40 20% 97%)", marginBottom: 2 }}>{current.title}</h2>
                <p style={{ fontSize: 15, color: "hsl(30 8% 62%)", marginBottom: 20 }}>
                  {new Date(current.created_at).toLocaleString()} · {current.period}
                </p>
                {current.sections.map((s, i) => (
                  <div key={i} style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 14, letterSpacing: "0.2em", textTransform: "uppercase", color: "hsl(30 8% 62%)", marginBottom: 8 }}>
                      {s.heading}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: 6 }}>
                      {s.items.map((item, j) => {
                        const id = briefItemId(current.id, i, j, item);
                        const issue = briefItemIssue(item);
                        return (
                          <li key={j} style={{ fontSize: 17, color: "hsl(40 20% 97%)" }}>
                            <BriefCheckItem
                              done={isDone(id)}
                              borderColor="hsl(40 20% 97% / 0.25)"
                              mutedColor="hsl(30 8% 62%)"
                              onComplete={() => complete({
                                item_id: id,
                                item_text: item.text,
                                issue_identifier: issue,
                                brief_date: current.created_at.slice(0, 10),
                              })}
                              onUndo={() => undo(id)}
                            >
                              {item.link ? <a href={item.link} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{item.text}</a> : item.text}
                            </BriefCheckItem>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent
          side="right"
          style={{ background: "hsl(36 5% 16%)", color: "hsl(40 20% 97%)", borderColor: "hsl(40 20% 97% / 0.10)" }}
          className="!w-full sm:!max-w-md overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="font-serif italic text-xl" style={{ color: "hsl(40 20% 97%)" }}>Settings</SheetTitle>
            <SheetDescription style={{ fontSize: 17, color: "hsl(30 8% 62%)" }}>
              Keys this tab needs. Generated and rotated here — never in Supabase or Lovable.
            </SheetDescription>
          </SheetHeader>
          <div style={{ marginTop: 20 }}>
            <SecretRow
              label="Brief ingest key" secretKey="briefs_ingest_secret" placeholder="" generated
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
          </div>
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
