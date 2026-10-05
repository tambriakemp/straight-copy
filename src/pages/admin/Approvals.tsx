import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Eye, EyeOff, RefreshCw, Settings, X } from "lucide-react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";

// prospect_approvals and app_secrets aren't in the generated Database type
// yet — see the same note in Briefs.tsx.
const db = supabase as unknown as { from: (table: string) => any };

type Status = "pending" | "approved" | "rejected";

interface Prospect {
  id: string;
  batch: string;
  slug: string;
  company: string;
  city: string | null;
  trade: string | null;
  contact_name: string | null;
  contact_email: string | null;
  hook: string | null;
  preview_url: string | null;
  preview_image_url: string | null;
  email_subject: string | null;
  email_body: string | null;
  status: Status;
  notes: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_LABEL: Record<Status, string> = { pending: "Pending", approved: "Approved", rejected: "Rejected" };
const STATUS_COLOR: Record<Status, string> = {
  pending: "hsl(35 70% 55%)",
  approved: "hsl(140 35% 48%)",
  rejected: "hsl(5 55% 55%)",
};

function randomSecret(len = 40) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, len);
}

// Same Settings-card pattern as Briefs.tsx's SecretRow, duplicated locally
// rather than extracted into a shared component — each settings-bearing
// admin page owns its own copy today (see Briefs.tsx, Audits.tsx).
function SecretRow({ label, secretKey, hint }: { label: string; secretKey: string; hint: string }) {
  const [value, setValue] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [revealed, setRevealed] = useState(false);
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
          <button className="crm-btn crm-btn--ghost crm-btn--sm" disabled={busy}
            onClick={() => { if (confirm(`Rotate ${label}? Anything using the old value stops working immediately.`)) save(randomSecret()); }}>
            <RefreshCw className="h-3 w-3" /> Rotate
          </button>
        </div>
      ) : (
        <button className="crm-btn crm-btn--bronze crm-btn--sm" disabled={busy} onClick={() => save(randomSecret())}>
          Generate
        </button>
      )}
    </div>
  );
}

export default function Approvals() {
  const { user } = useAdminAuth();
  const [prospects, setProspects] = useState<Prospect[] | null>(null);
  const [batch, setBatch] = useState<string>("all");
  const [status, setStatus] = useState<"all" | Status>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = async () => {
    const { data, error } = await db.from("prospect_approvals").select("*")
      .order("batch", { ascending: false }).order("created_at", { ascending: true });
    if (error) { toast.error(error.message); return; }
    setProspects((data ?? []) as Prospect[]);
  };
  useEffect(() => { load(); }, []);

  const batches = useMemo(() => {
    const set = new Set((prospects ?? []).map((p) => p.batch));
    return Array.from(set).sort().reverse();
  }, [prospects]);

  // Default to the most recent batch once it's known, rather than "all" —
  // a big outreach round should open already scoped to this week's work.
  useEffect(() => {
    if (batch === "all" && batches.length) setBatch(batches[0]);
  }, [batches, batch]);

  const scoped = useMemo(
    () => (prospects ?? []).filter((p) => batch === "all" || p.batch === batch),
    [prospects, batch],
  );
  const filtered = useMemo(
    () => scoped.filter((p) => status === "all" || p.status === status),
    [scoped, status],
  );
  const counts = useMemo(() => ({
    all: scoped.length,
    pending: scoped.filter((p) => p.status === "pending").length,
    approved: scoped.filter((p) => p.status === "approved").length,
    rejected: scoped.filter((p) => p.status === "rejected").length,
  }), [scoped]);

  const decide = async (id: string, next: Status, notes?: string) => {
    setBusyId(id);
    const { error } = await db.from("prospect_approvals").update({
      status: next,
      notes: notes ?? null,
      decided_at: new Date().toISOString(),
      decided_by: user?.email ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    setBusyId(null);
    if (error) { toast.error(error.message); return; }
    toast.success(next === "approved" ? "Approved" : "Rejected");
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
    setOpenId(null);
    load();
  };

  const bulkApprove = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const { error } = await db.from("prospect_approvals").update({
      status: "approved",
      decided_at: new Date().toISOString(),
      decided_by: user?.email ?? null,
      updated_at: new Date().toISOString(),
    }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`Approved ${ids.length}`);
    setSelected(new Set());
    load();
  };

  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const open = filtered.find((p) => p.id === openId) ?? null;

  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">Outreach pipeline</div>
            <h1 className="roster__title">Prospect <em>approvals</em></h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              Review this batch's redesigns and send copy before Monday's send.{" "}
              <Link to="/admin/briefs" style={{ color: "hsl(40 20% 97%)" }}>Briefs →</Link>
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

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
          <select value={batch} onChange={(e) => setBatch(e.target.value)} className="crm-input" style={{ width: 200 }}>
            <option value="all">All batches</option>
            {batches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          {(["pending", "approved", "rejected", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className="crm-btn crm-btn--sm"
              style={{
                background: status === s ? "var(--crm-charcoal)" : "transparent",
                color: status === s ? "var(--crm-warm-white)" : "var(--crm-taupe)",
                border: "1px solid var(--crm-border-dark)",
              }}
            >
              {s === "all" ? "All" : STATUS_LABEL[s]} ({counts[s]})
            </button>
          ))}
          {selected.size > 0 && (
            <button className="crm-btn crm-btn--bronze crm-btn--sm" onClick={bulkApprove} style={{ marginLeft: "auto" }}>
              <Check className="h-3 w-3" /> Approve {selected.size} selected
            </button>
          )}
        </div>

        {!prospects ? (
          <div style={{ fontSize: 16, color: "hsl(30 8% 62%)" }}>Loading…</div>
        ) : !filtered.length ? (
          <div className="crm-empty">
            <div className="crm-empty__glyph">✓</div>
            <div className="crm-empty__title">Nothing <em>{status === "all" ? "here" : status}</em>.</div>
          </div>
        ) : (
          <>
            <div className="roster__head-row" style={{ gridTemplateColumns: "28px 72px 2fr 1fr auto" }}>
              <div className="roster__col-h" style={{ cursor: "default" }} />
              <div className="roster__col-h" style={{ cursor: "default" }} />
              <div className="roster__col-h" style={{ cursor: "default" }}>Company</div>
              <div className="roster__col-h" style={{ cursor: "default" }}>Status</div>
              <div className="roster__col-h" style={{ cursor: "default", justifyContent: "flex-end" }}>Actions</div>
            </div>
            <div className="roster__list">
              {filtered.map((p) => (
                <div key={p.id} className="roster__row" style={{ gridTemplateColumns: "28px 72px 2fr 1fr auto", cursor: "default" }}>
                  <input
                    type="checkbox"
                    disabled={p.status !== "pending"}
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  {p.preview_url ? (
                    <img
                      src={p.preview_image_url ?? `${p.preview_url.replace(/\/$/, "")}/preview.jpg`}
                      alt={p.company}
                      style={{ width: 64, height: 48, objectFit: "cover", background: "#333" }}
                      onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }}
                    />
                  ) : <div style={{ width: 64, height: 48, background: "#333" }} />}
                  <div>
                    <div className="roster__name" style={{ fontSize: 18 }}>{p.company}</div>
                    <div style={{ fontSize: 13, color: "hsl(30 8% 62%)" }}>
                      {p.city}{p.trade ? ` · ${p.trade}` : ""}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em",
                    color: STATUS_COLOR[p.status], border: `1px solid ${STATUS_COLOR[p.status]}`,
                    borderRadius: 20, padding: "3px 10px", justifySelf: "start",
                  }}>
                    {STATUS_LABEL[p.status]}
                  </span>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => setOpenId(p.id)}>
                      Review
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {open && (
          <div
            role="dialog"
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", zIndex: 80, padding: 20 }}
            onClick={() => setOpenId(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "hsl(36 5% 16%)", maxWidth: 640, width: "100%", maxHeight: "90vh", overflowY: "auto", padding: 28 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 className="font-serif italic text-2xl" style={{ color: "hsl(40 20% 97%)", marginBottom: 2 }}>
                    {open.company}
                  </h2>
                  <p style={{ fontSize: 14, color: "hsl(30 8% 62%)" }}>
                    {open.city}{open.trade ? ` · ${open.trade}` : ""} · batch {open.batch}
                  </p>
                </div>
                <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => setOpenId(null)}>Close</button>
              </div>

              {open.preview_url && (
                <a
                  href={open.preview_url} target="_blank" rel="noreferrer"
                  style={{ color: "hsl(26 60% 55%)", fontSize: 14, display: "inline-flex", gap: 6, alignItems: "center", margin: "10px 0" }}
                >
                  Open live preview <ExternalLink className="h-3 w-3" />
                </a>
              )}

              {open.hook && (
                <p style={{ fontSize: 15, color: "hsl(40 20% 97%)", lineHeight: 1.5, margin: "14px 0" }}>{open.hook}</p>
              )}

              {(open.email_subject || open.email_body) && (
                <div style={{ margin: "18px 0" }}>
                  <div style={{ fontSize: 13, letterSpacing: "0.15em", textTransform: "uppercase", color: "hsl(30 8% 62%)", marginBottom: 6 }}>
                    Email as it will send
                  </div>
                  <div style={{ background: "hsl(40 8% 10%)", border: "1px solid hsl(40 20% 97% / 0.08)", padding: 14 }}>
                    {open.email_subject && (
                      <div style={{ fontSize: 15, color: "hsl(40 20% 97%)", marginBottom: 8 }}>
                        <strong>Subject:</strong> {open.email_subject}
                      </div>
                    )}
                    {open.email_body && (
                      <div style={{ fontSize: 14, color: "hsl(40 20% 97%)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                        {open.email_body}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(open.contact_name || open.contact_email) && (
                <p style={{ fontSize: 13, color: "hsl(30 8% 62%)" }}>
                  To: {open.contact_name}{open.contact_name && open.contact_email ? " · " : ""}{open.contact_email}
                </p>
              )}

              <textarea
                className="crm-input"
                placeholder="Notes (shown back to Nicole; optional on approve, encouraged on reject)"
                defaultValue={open.notes ?? ""}
                onChange={(e) => setNoteDrafts((d) => ({ ...d, [open.id]: e.target.value }))}
                style={{ width: "100%", minHeight: 80, margin: "14px 0", fontFamily: "inherit" }}
              />

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  className="crm-btn crm-btn--bronze" disabled={busyId === open.id}
                  onClick={() => decide(open.id, "approved", noteDrafts[open.id] ?? open.notes ?? undefined)}
                >
                  <Check className="h-4 w-4" /> Approve
                </button>
                <button
                  className="crm-btn crm-btn--ghost" disabled={busyId === open.id}
                  onClick={() => decide(open.id, "rejected", noteDrafts[open.id] ?? open.notes ?? undefined)}
                >
                  <X className="h-4 w-4" /> Reject
                </button>
              </div>
            </div>
          </div>
        )}

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
              Key this tab needs. Generated and rotated here — never in Supabase or Lovable.
            </SheetDescription>
          </SheetHeader>
          <div style={{ marginTop: 20 }}>
            <SecretRow
              label="Prospect approvals ingest key" secretKey="prospect_approvals_ingest_secret"
              hint="Save this as a Paperclip secret named PROSPECT-APPROVALS-INGEST-KEY — Ara adds it to Nicole's env from there. Rotating breaks her pushes and decision reads until she has the new value."
            />
          </div>
        </SheetContent>
      </Sheet>
    </AdminLayout>
  );
}
