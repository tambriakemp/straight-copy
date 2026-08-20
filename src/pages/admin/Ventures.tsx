// Ventures roster — the non-client revenue streams, as a peer to /admin/clients.
// Modelled on src/pages/admin/Dashboard.tsx (the client roster).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { money } from "@/components/admin/DashboardPrimitives";
import { venturesApi, errMsg, KIND_LABEL, type Venture } from "@/lib/venturesApi";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

const BLANK = { name: "", slug: "", kind: "training", platform: "stripe" };

export default function Ventures() {
  const navigate = useNavigate();
  const [ventures, setVentures] = useState<Venture[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { ventures } = await venturesApi<{ ventures: Venture[] }>("/ventures");
      setVentures(ventures);
    } catch (e) {
      toast.error(errMsg(e) || "Failed to load ventures");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!draft.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const slug = (draft.slug.trim() || draft.name)
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { venture } = await venturesApi<{ venture: Venture }>("/ventures", {
        method: "POST",
        body: { ...draft, slug, funnel_stages: defaultStages(draft.kind) },
      });
      toast.success(`${venture.name} created`);
      setOpen(false);
      setDraft(BLANK);
      navigate(`/admin/ventures/${venture.id}`);
    } catch (e) {
      toast.error(errMsg(e) || "Could not create venture");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__ghost">REV</div>

        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">Revenue Streams</div>
            <h1 className="roster__title">All <em>ventures</em></h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              Everything you earn from outside client work — live trainings, the newsletter,
              the community. Cash and run-rate are tracked separately so the two never get added together.
            </p>
          </div>
          <div className="roster__actions">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button className="crm-btn crm-btn--primary">+ New Venture</button>
              </DialogTrigger>
              <DialogContent
                data-mobile-bottom-sheet="true"
                className="crm-shell !bg-[hsl(36_5%_16%)] !border-[hsl(40_20%_97%/0.08)] !text-[hsl(40_20%_97%)] !rounded-none !max-w-md overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-serif italic text-2xl text-[hsl(40_20%_97%)]">New venture</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div>
                    <label className="crm-label">Name *</label>
                    <input className="crm-input" value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      placeholder="Take the Keys" />
                  </div>
                  <div>
                    <label className="crm-label">Kind</label>
                    <select className="crm-input" value={draft.kind}
                      onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                      {Object.entries(KIND_LABEL).map(([k, label]) => (
                        <option key={k} value={k}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="crm-label">Billing platform</label>
                    <select className="crm-input" value={draft.platform}
                      onChange={(e) => setDraft({ ...draft, platform: e.target.value })}>
                      <option value="stripe">Stripe (revenue syncs automatically)</option>
                      <option value="substack">Substack (enter numbers manually)</option>
                      <option value="skool">Skool (enter numbers manually)</option>
                      <option value="manual">Other / manual</option>
                    </select>
                  </div>
                </div>
                <DialogFooter className="mt-2">
                  <button className="crm-btn crm-btn--bronze" onClick={create} disabled={saving}>
                    {saving ? "Creating…" : "Create venture"}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <p className="text-[hsl(30_8%_62%)] text-sm">Loading ventures…</p>
        ) : !ventures.length ? (
          <div className="crm-empty">
            <div className="crm-empty__glyph">∅</div>
            <div className="crm-empty__title">No <em>ventures</em> yet.</div>
            <div className="crm-empty__sub">Add your first revenue stream to start tracking it here.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {ventures.map((v) => {
              const mrr = v.latest_metrics?.mrr_cents ?? 0;
              const members = v.latest_metrics?.paid_members;
              return (
                <button key={v.id} onClick={() => navigate(`/admin/ventures/${v.id}`)}
                  style={{ padding: "18px 20px", background: "var(--crm-charcoal)",
                    border: "1px solid var(--crm-border-dark)", textAlign: "left",
                    cursor: "pointer", color: "var(--crm-warm-white)" }}>
                  <div style={{ fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>
                    {KIND_LABEL[v.kind] ?? v.kind}
                  </div>
                  <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 28, marginTop: 6 }}>{v.name}</div>
                  <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>
                        Cash 30d
                      </div>
                      <div style={{ fontSize: 20, marginTop: 2 }}>{money(v.cash_30d_cents ?? 0)}</div>
                    </div>
                    {!!mrr && (
                      <div>
                        <div style={{ fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>
                          Run-rate
                        </div>
                        <div style={{ fontSize: 20, marginTop: 2, color: "#9db8a6" }}>{money(mrr)}/mo</div>
                      </div>
                    )}
                    {members != null && (
                      <div>
                        <div style={{ fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>
                          Members
                        </div>
                        <div style={{ fontSize: 20, marginTop: 2 }}>{members}</div>
                      </div>
                    )}
                  </div>
                  {v.platform && v.platform !== "stripe" && (
                    <div style={{ fontSize: 13, color: "var(--crm-taupe)", marginTop: 10, fontStyle: "italic" }}>
                      {v.platform} bills directly — numbers entered manually
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function defaultStages(kind: string) {
  if (kind === "training") {
    return [
      { key: "visit", label: "Landing page visit" },
      { key: "optin", label: "Opted in" },
      { key: "registered", label: "Registered" },
      { key: "paid", label: "Paid" },
      { key: "attended", label: "Attended" },
    ];
  }
  if (kind === "newsletter") {
    return [
      { key: "visit", label: "Publication visit" },
      { key: "free_sub", label: "Free subscriber" },
      { key: "paid_sub", label: "Paid subscriber" },
    ];
  }
  return [
    { key: "visit", label: "Visit" },
    { key: "applied", label: "Applied" },
    { key: "member", label: "Paid member" },
  ];
}
