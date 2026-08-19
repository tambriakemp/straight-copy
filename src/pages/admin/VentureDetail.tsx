// Venture detail — tabs modelled on src/components/ProjectTabs.tsx usage in
// ClientDetail.tsx. Overview / Revenue / Launches / Funnel / Settings.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import AdminLayout from "@/components/admin/AdminLayout";
import { Empty, RevenueCard, Section, money } from "@/components/admin/DashboardPrimitives";
import {
  venturesApi, errMsg, METRIC_KEYS, KIND_LABEL,
  type Venture, type Launch, type RevenueEntry,
} from "@/lib/venturesApi";

type Analytics = {
  venture: Venture;
  cash: { total_cents: number; last_30d_cents: number; monthly: Array<{ month: string; cents: number }> };
  levels: { latest: Record<string, number>; series: Record<string, Array<{ date: string; value: number }>> };
  funnel: { stages: Array<{ key: string; label: string }>; counts: Record<string, number> };
  launches: Launch[];
};

const TABS = ["Overview", "Revenue", "Launches", "Funnel", "Settings"] as const;
type Tab = typeof TABS[number];

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function VentureDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<Analytics | null>(null);
  const [entries, setEntries] = useState<RevenueEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [analytics, revenue] = await Promise.all([
        venturesApi<Analytics>(`/ventures/${id}/analytics`),
        venturesApi<{ entries: RevenueEntry[] }>(`/ventures/${id}/revenue`),
      ]);
      setData(analytics);
      setEntries(revenue.entries);
    } catch (e) {
      toast.error(errMsg(e) || "Failed to load venture");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const v = data?.venture;
  const metricDefs = useMemo(
    () => METRIC_KEYS[v?.kind ?? "other"] ?? METRIC_KEYS.other,
    [v?.kind],
  );

  if (loading) {
    return <AdminLayout><div className="roster"><p className="text-[hsl(30_8%_62%)] text-sm">Loading…</p></div></AdminLayout>;
  }
  if (!v || !data) {
    return <AdminLayout><div className="roster"><Empty>Venture not found.</Empty></div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__ghost">{v.slug.slice(0, 4).toUpperCase()}</div>

        <div className="roster__head">
          <div className="roster__title-block">
            <button onClick={() => navigate("/admin/ventures")} className="crm-btn crm-btn--ghost"
              style={{ fontSize: 11, marginBottom: 10 }}>← All ventures</button>
            <div className="roster__eyebrow">{KIND_LABEL[v.kind] ?? v.kind}</div>
            <h1 className="roster__title">{v.name}</h1>
            <hr className="roster__rule" />
            {v.description && <p className="roster__sub">{v.description}</p>}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, overflowX: "auto", borderBottom: "1px solid var(--crm-border-dark)" }}>
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding: "8px 14px", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
                whiteSpace: "nowrap", background: "transparent", cursor: "pointer",
                color: tab === t ? "var(--crm-warm-white)" : "var(--crm-taupe)",
                borderBottom: tab === t ? "2px solid var(--crm-warm-white)" : "2px solid transparent" }}>
              {t}
            </button>
          ))}
        </div>

        {tab === "Overview" && <Overview data={data} metricDefs={metricDefs} />}
        {tab === "Revenue" && (
          <RevenueTab ventureId={v.id} data={data} entries={entries} metricDefs={metricDefs} onSaved={load} />
        )}
        {tab === "Launches" && <LaunchesTab venture={v} launches={data.launches} onSaved={load} />}
        {tab === "Funnel" && <FunnelTab data={data} />}
        {tab === "Settings" && <SettingsTab venture={v} />}
      </div>
    </AdminLayout>
  );
}

// ---------------------------------------------------------------- Overview
function Overview({ data, metricDefs }: {
  data: Analytics; metricDefs: Array<{ key: string; label: string; money?: boolean }>;
}) {
  const mrr = data.levels.latest.mrr_cents ?? 0;
  const mrrSeries = data.levels.series.mrr_cents ?? [];
  const memberSeries = data.levels.series.paid_members ?? [];

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 24 }}>
        <RevenueCard label="Cash (30d)" amount={data.cash.last_30d_cents} />
        <RevenueCard label="Cash (all time in range)" amount={data.cash.total_cents} />
        <RevenueCard label="Recurring MRR" amount={mrr} tone="accent" note="run-rate, not cash collected" />
      </div>

      {metricDefs.some((m) => !m.money && data.levels.latest[m.key] != null) && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
          {metricDefs.filter((m) => !m.money).map((m) => (
            <div key={m.key} style={{ padding: "16px 18px", background: "var(--crm-charcoal)", border: "1px solid var(--crm-border-dark)" }}>
              <div style={{ fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>{m.label}</div>
              <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 34, marginTop: 6 }}>
                {data.levels.latest[m.key] ?? "—"}
              </div>
            </div>
          ))}
        </div>
      )}

      {!!data.cash.monthly.length && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.35em", textTransform: "uppercase", color: "var(--crm-taupe)", marginBottom: 8 }}>
            Cash by month
          </div>
          <div style={{ background: "var(--crm-charcoal)", border: "1px solid var(--crm-border-dark)", padding: "16px 8px 8px" }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.cash.monthly.map((m) => ({ month: m.month.slice(5), Cash: m.cents / 100 }))}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--crm-border-dark)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "var(--crm-taupe)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "var(--crm-taupe)", fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(x) => `$${x >= 1000 ? `${Math.round(x / 1000)}k` : x}`} />
                <Tooltip contentStyle={{ background: "var(--crm-ink)", border: "1px solid var(--crm-border-dark)", fontSize: 12 }}
                  formatter={(x: number) => [`$${x.toLocaleString()}`, "Cash"]} />
                <Bar dataKey="Cash" fill="#9db8a6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {(mrrSeries.length > 1 || memberSeries.length > 1) && (
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.35em", textTransform: "uppercase", color: "var(--crm-taupe)", marginBottom: 8 }}>
            Growth
          </div>
          <div style={{ background: "var(--crm-charcoal)", border: "1px solid var(--crm-border-dark)", padding: "16px 8px 8px" }}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={mergeSeries(mrrSeries, memberSeries)}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--crm-border-dark)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "var(--crm-taupe)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fill: "var(--crm-taupe)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "var(--crm-taupe)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "var(--crm-ink)", border: "1px solid var(--crm-border-dark)", fontSize: 12 }} />
                <Line yAxisId="left" type="monotone" dataKey="Members" stroke="#dbb172" dot={false} strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="MRR" stroke="#9db8a6" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}

function mergeSeries(
  mrr: Array<{ date: string; value: number }>,
  members: Array<{ date: string; value: number }>,
) {
  const byDate: Record<string, { date: string; MRR?: number; Members?: number }> = {};
  for (const p of mrr) (byDate[p.date] ??= { date: p.date }).MRR = p.value / 100;
  for (const p of members) (byDate[p.date] ??= { date: p.date }).Members = p.value;
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------- Revenue
function RevenueTab({ ventureId, data, entries, metricDefs, onSaved }: {
  ventureId: string;
  data: Analytics;
  entries: RevenueEntry[];
  metricDefs: Array<{ key: string; label: string; money?: boolean }>;
  onSaved: () => void;
}) {
  const [capturedOn, setCapturedOn] = useState(todayIso());
  const [values, setValues] = useState<Record<string, string>>({});
  const [savingSnap, setSavingSnap] = useState(false);

  const [entry, setEntry] = useState({ amount: "", description: "", occurred_on: todayIso(), kind: "sale" });
  const [savingEntry, setSavingEntry] = useState(false);

  const saveSnapshot = async () => {
    const metrics: Record<string, number> = {};
    for (const m of metricDefs) {
      const raw = values[m.key];
      if (raw == null || raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) return toast.error(`${m.label} must be a number`);
      // MRR is entered in dollars but stored in cents, like every other amount.
      metrics[m.key] = m.money ? Math.round(n * 100) : n;
    }
    if (!Object.keys(metrics).length) return toast.error("Enter at least one number");
    setSavingSnap(true);
    try {
      await venturesApi(`/ventures/${ventureId}/snapshots`, {
        method: "POST", body: { captured_on: capturedOn, metrics },
      });
      toast.success("Numbers logged");
      setValues({});
      onSaved();
    } catch (e) {
      toast.error(errMsg(e) || "Could not save");
    } finally {
      setSavingSnap(false);
    }
  };

  const saveEntry = async () => {
    const amt = Number(entry.amount);
    if (!Number.isFinite(amt) || amt === 0) return toast.error("Enter an amount");
    setSavingEntry(true);
    try {
      await venturesApi(`/ventures/${ventureId}/revenue`, {
        method: "POST",
        body: {
          amount_cents: Math.round(amt * 100),
          occurred_at: new Date(`${entry.occurred_on}T12:00:00Z`).toISOString(),
          kind: entry.kind,
          description: entry.description || null,
        },
      });
      toast.success("Revenue recorded");
      setEntry({ amount: "", description: "", occurred_on: todayIso(), kind: "sale" });
      onSaved();
    } catch (e) {
      toast.error(errMsg(e) || "Could not save");
    } finally {
      setSavingEntry(false);
    }
  };

  const lastByMetric: Record<string, { value: number; date: string }> = {};
  for (const [key, pts] of Object.entries(data.levels.series)) {
    const last = pts[pts.length - 1];
    if (last) lastByMetric[key] = { value: last.value, date: last.date };
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Snapshot entry — the Substack/Skool path. Must be fast or it won't get used. */}
      <Section title="Log today's numbers">
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          <p style={{ fontSize: 12, color: "var(--crm-taupe)", margin: 0 }}>
            Substack and Skool bill members themselves, so these are read off their dashboards.
            Saving the same date twice corrects it rather than adding a duplicate.
          </p>
          <div>
            <label className="crm-label">Date</label>
            <input type="date" className="crm-input" value={capturedOn}
              onChange={(e) => setCapturedOn(e.target.value)} />
          </div>
          {metricDefs.map((m) => {
            const prev = lastByMetric[m.key];
            return (
              <div key={m.key}>
                <label className="crm-label">
                  {m.label}{m.money ? " ($)" : ""}
                  {prev && (
                    <span style={{ color: "var(--crm-taupe)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                      {"  ·  last: "}{m.money ? money(prev.value) : prev.value} on {prev.date}
                    </span>
                  )}
                </label>
                <input className="crm-input" inputMode="decimal" value={values[m.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [m.key]: e.target.value })}
                  placeholder={prev ? String(m.money ? prev.value / 100 : prev.value) : "—"} />
              </div>
            );
          })}
          <button className="crm-btn crm-btn--bronze" onClick={saveSnapshot} disabled={savingSnap}
            style={{ justifySelf: "start" }}>
            {savingSnap ? "Saving…" : "Save numbers"}
          </button>
        </div>
      </Section>

      {/* Manual cash entry — payouts, one-off sales outside Stripe. */}
      <Section title="Record a payment">
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          <p style={{ fontSize: 12, color: "var(--crm-taupe)", margin: 0 }}>
            Real money in — a Substack payout, a manual sale. Stripe payments land here automatically.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <div>
              <label className="crm-label">Amount ($)</label>
              <input className="crm-input" inputMode="decimal" value={entry.amount}
                onChange={(e) => setEntry({ ...entry, amount: e.target.value })} placeholder="2900" />
            </div>
            <div>
              <label className="crm-label">Date</label>
              <input type="date" className="crm-input" value={entry.occurred_on}
                onChange={(e) => setEntry({ ...entry, occurred_on: e.target.value })} />
            </div>
            <div>
              <label className="crm-label">Kind</label>
              <select className="crm-input" value={entry.kind}
                onChange={(e) => setEntry({ ...entry, kind: e.target.value })}>
                <option value="payout">Platform payout</option>
                <option value="sale">One-off sale</option>
                <option value="subscription">Subscription</option>
                <option value="refund">Refund</option>
                <option value="adjustment">Adjustment</option>
              </select>
            </div>
          </div>
          <div>
            <label className="crm-label">Note</label>
            <input className="crm-input" value={entry.description}
              onChange={(e) => setEntry({ ...entry, description: e.target.value })}
              placeholder="August Substack payout" />
          </div>
          <button className="crm-btn crm-btn--bronze" onClick={saveEntry} disabled={savingEntry}
            style={{ justifySelf: "start" }}>
            {savingEntry ? "Saving…" : "Record payment"}
          </button>
        </div>
      </Section>

      <Section title="Recent cash">
        {!entries.length ? <Empty>Nothing recorded yet.</Empty> : (
          <div>
            {entries.slice(0, 30).map((e) => (
              <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12,
                padding: "10px 14px", background: "var(--crm-charcoal)",
                borderBottom: "1px solid var(--crm-border-dark)", fontSize: 13 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.description || e.customer_email || e.kind}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--crm-taupe)" }}>
                    {new Date(e.occurred_at).toLocaleDateString()} · {e.kind} · {e.source}
                  </div>
                </div>
                <div style={{ alignSelf: "center", color: e.amount_cents < 0 ? "#e07a5f" : "var(--crm-warm-white)" }}>
                  {money(e.amount_cents)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- Launches
function LaunchesTab({ venture, launches, onSaved }: {
  venture: Venture; launches: Launch[]; onSaved: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: "", starts_at: "", goal_revenue: "", goal_signups: "", ticket_price: "" });

  const create = async () => {
    if (!draft.name.trim()) return toast.error("Name is required");
    setCreating(true);
    try {
      const slug = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      await venturesApi(`/ventures/${venture.id}/launches`, {
        method: "POST",
        body: {
          name: draft.name,
          slug,
          starts_at: draft.starts_at ? new Date(`${draft.starts_at}T12:00:00Z`).toISOString() : null,
          goal_revenue_cents: draft.goal_revenue ? Math.round(Number(draft.goal_revenue) * 100) : null,
          goal_signups: draft.goal_signups ? Number(draft.goal_signups) : null,
          ticket_price_cents: draft.ticket_price ? Math.round(Number(draft.ticket_price) * 100) : null,
        },
      });
      toast.success("Launch created with its checklist");
      setDraft({ name: "", starts_at: "", goal_revenue: "", goal_signups: "", ticket_price: "" });
      onSaved();
    } catch (e) {
      toast.error(errMsg(e) || "Could not create launch");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Section title="New launch">
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          <p style={{ fontSize: 12, color: "var(--crm-taupe)", margin: 0 }}>
            Each cohort gets its own checklist, dated off the session date.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <div>
              <label className="crm-label">Name</label>
              <input className="crm-input" value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Take the Keys — September" />
            </div>
            <div>
              <label className="crm-label">Session date</label>
              <input type="date" className="crm-input" value={draft.starts_at}
                onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })} />
            </div>
            <div>
              <label className="crm-label">Ticket price ($)</label>
              <input className="crm-input" inputMode="decimal" value={draft.ticket_price}
                onChange={(e) => setDraft({ ...draft, ticket_price: e.target.value })} />
            </div>
            <div>
              <label className="crm-label">Revenue goal ($)</label>
              <input className="crm-input" inputMode="decimal" value={draft.goal_revenue}
                onChange={(e) => setDraft({ ...draft, goal_revenue: e.target.value })} />
            </div>
            <div>
              <label className="crm-label">Signup goal</label>
              <input className="crm-input" inputMode="numeric" value={draft.goal_signups}
                onChange={(e) => setDraft({ ...draft, goal_signups: e.target.value })} />
            </div>
          </div>
          <button className="crm-btn crm-btn--bronze" onClick={create} disabled={creating} style={{ justifySelf: "start" }}>
            {creating ? "Creating…" : "Create launch"}
          </button>
        </div>
      </Section>

      <Section title="All launches">
        {!launches.length ? <Empty>No launches yet.</Empty> : (
          <div>
            {launches.map((l) => (
              <Link key={l.id} to={`/admin/ventures/${venture.id}/launches/${l.id}`}
                style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "12px 14px",
                  background: "var(--crm-charcoal)", borderBottom: "1px solid var(--crm-border-dark)",
                  color: "var(--crm-warm-white)", fontSize: 13 }}>
                <div>
                  <div style={{ fontWeight: 500 }}>{l.name}</div>
                  <div style={{ fontSize: 11, color: "var(--crm-taupe)" }}>
                    {l.status}
                    {l.starts_at ? ` · ${new Date(l.starts_at).toLocaleDateString()}` : ""}
                    {l.goal_revenue_cents ? ` · goal ${money(l.goal_revenue_cents)}` : ""}
                  </div>
                </div>
                <div style={{ alignSelf: "center", color: "var(--crm-taupe)", fontSize: 11 }}>→</div>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- Funnel
function FunnelTab({ data }: { data: Analytics }) {
  const stages = data.funnel.stages ?? [];
  const rows = stages.map((s) => ({ stage: s.label, count: data.funnel.counts[s.key] ?? 0 }));
  const top = rows[0]?.count ?? 0;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Section title="Funnel (last 180 days)">
        {!rows.length ? <Empty>No funnel stages configured for this venture.</Empty> : !top ? (
          <Empty>
            No funnel events recorded yet. Wire the tracker into your landing page — see the Settings tab.
          </Empty>
        ) : (
          <div style={{ padding: 16 }}>
            <ResponsiveContainer width="100%" height={Math.max(180, rows.length * 46)}>
              <BarChart data={rows} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="var(--crm-border-dark)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "var(--crm-taupe)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="stage" width={130}
                  tick={{ fill: "var(--crm-taupe)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "var(--crm-ink)", border: "1px solid var(--crm-border-dark)", fontSize: 12 }} />
                <Bar dataKey="count" fill="#9db8a6" />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 12, display: "grid", gap: 4 }}>
              {rows.map((r, i) => (
                <div key={r.stage} style={{ fontSize: 12, color: "var(--crm-taupe)" }}>
                  {r.stage}: <span style={{ color: "var(--crm-warm-white)" }}>{r.count}</span>
                  {i > 0 && rows[i - 1].count > 0 && (
                    <span> · {Math.round((r.count / rows[i - 1].count) * 100)}% from previous</span>
                  )}
                  {i > 0 && top > 0 && <span> · {Math.round((r.count / top) * 100)}% of top</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------- Settings
function SettingsTab({ venture }: { venture: Venture }) {
  const snippet = `import { trackFunnel } from "@/lib/funnelTrack";

trackFunnel("${venture.public_ingest_key ?? "<ingest key>"}", "${venture.funnel_stages?.[0]?.key ?? "visit"}");`;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Section title="Funnel tracking">
        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          <p style={{ fontSize: 12, color: "var(--crm-taupe)", margin: 0 }}>
            Call this from your landing page and opt-in form to record funnel steps.
            The key below authorises writes for this venture only — treat it as public,
            and rotate it if it ends up somewhere it shouldn't.
          </p>
          <pre style={{ background: "var(--crm-ink)", border: "1px solid var(--crm-border-dark)", padding: 12,
            fontSize: 11, overflowX: "auto", margin: 0, color: "var(--crm-warm-white)" }}>{snippet}</pre>
          <div>
            <label className="crm-label">Stages</label>
            <div style={{ fontSize: 12, color: "var(--crm-taupe)" }}>
              {(venture.funnel_stages ?? []).map((s) => `${s.key} (${s.label})`).join("  →  ") || "None configured"}
            </div>
          </div>
        </div>
      </Section>

      {venture.platform === "stripe" && (
        <Section title="Stripe">
          <div style={{ padding: 16, fontSize: 12, color: "var(--crm-taupe)", display: "grid", gap: 8 }}>
            <p style={{ margin: 0 }}>
              Point your Stripe webhook at <code>/functions/v1/stripe-webhook</code> and set
              <code> STRIPE_WEBHOOK_SECRET</code>. Payments land as cash automatically.
            </p>
            <p style={{ margin: 0 }}>
              Set <code>venture_slug={venture.slug}</code> and <code>launch_id</code> in your payment link's
              metadata so each sale is attributed to the right cohort.
            </p>
            {venture.platform_account_ref && (
              <p style={{ margin: 0 }}>Matching on product/price: <code>{venture.platform_account_ref}</code></p>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
