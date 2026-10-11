import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import SidePanel from "@/components/admin/SidePanel";
import { supabase } from "@/integrations/supabase/client";
import { loadAdminOperations, projectMap, type AdminOperations } from "@/lib/adminOperations";
import { usd } from "@/lib/clientBalance";
import {
  bucketInvoices, collectedByMonth, byClient, daysUnpaid, isOverdue, billsWhen,
  type MoneyInvoice,
} from "@/lib/moneyRollup";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const PROJECT_TYPES = ["automation_build", "site_preview", "app_development", "web_development", "marketing"] as const;

type NewScheduleItem = { label: string; amount_dollars: string; due_date: string };

async function callInvoices(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const r = await fetch(`${SUPABASE_URL}/functions/v1/project-invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const out = await r.json();
  if (!r.ok) throw new Error(out.error || "Request failed");
  return out as Record<string, unknown>;
}

export default function Payments() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminOperations | null>(null);
  const reload = () => loadAdminOperations().then(setData).catch((error) => toast.error(error.message || "Failed to load payments"));
  useEffect(() => { reload(); }, []);
  // --- Schedules (CRE-332 Phase 5) --------------------------------------
  // --- New payment schedule -------------------------------------------------
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Which invoice row has an action in flight. */
  const [acting, setActing] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectType, setNewProjectType] = useState<string>("web_development");
  const [proposalId, setProposalId] = useState("");
  const [proposalOptions, setProposalOptions] = useState<{ id: string; title: string }[]>([]);
  const [title, setTitle] = useState("Payment schedule");
  const [items, setItems] = useState<NewScheduleItem[]>([{ label: "Deposit", amount_dollars: "", due_date: "" }]);

  const clientOptions = useMemo(
    () => Object.entries(data?.clientNames ?? {}).sort((a, b) => a[1].localeCompare(b[1])),
    [data],
  );
  const projectsForClient = useMemo(
    () => (data?.projects ?? []).filter((p) => p.client_id === clientId),
    [data, clientId],
  );
  const creatingNewProject = projectId === "__new__";

  useEffect(() => {
    if (!open) return;
    setProjectId(""); setNewProjectName(""); setProposalId(""); setProposalOptions([]);
    setTitle("Payment schedule");
    setItems([{ label: "Deposit", amount_dollars: "", due_date: "" }]);
  }, [open]);

  useEffect(() => {
    setProjectId(""); setProposalId(""); setProposalOptions([]);
  }, [clientId]);

  useEffect(() => {
    if (!clientId || !projectId || creatingNewProject) { setProposalOptions([]); return; }
    let cancelled = false;
    (async () => {
      const { data: rows2 } = await supabase
        .from("client_proposals")
        .select("id, title, status")
        .eq("client_id", clientId).eq("client_project_id", projectId)
        .in("status", ["signed", "sent", "ready", "draft"]);
      if (!cancelled) setProposalOptions((rows2 ?? []).map((r) => ({ id: r.id, title: r.title })));
    })();
    return () => { cancelled = true; };
  }, [clientId, projectId, creatingNewProject]);

  const createSchedule = async () => {
    if (!clientId) return toast.error("Pick a client");
    if (!projectId) return toast.error("Pick or create a project");
    if (creatingNewProject && !newProjectName.trim()) return toast.error("Name the new project");
    const cleanItems = items
      .map((it) => ({
        label: it.label.trim(),
        amount_cents: Math.round(parseFloat(it.amount_dollars || "0") * 100),
        due_date: it.due_date || null,
      }))
      .filter((it) => it.label);
    for (const it of cleanItems) {
      if (!it.amount_cents || it.amount_cents < 100) return toast.error(`${it.label}: amount must be at least $1`);
    }
    setSaving(true);
    try {
      let effectiveProjectId = projectId;
      if (creatingNewProject) {
        const { data: proj, error } = await supabase.from("client_projects").insert({
          client_id: clientId, name: newProjectName.trim(), type: newProjectType,
        }).select("id").single();
        if (error) throw error;
        effectiveProjectId = proj.id;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const r = await fetch(`${SUPABASE_URL}/functions/v1/project-invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "create-schedule",
          clientId, clientProjectId: effectiveProjectId,
          title: title.trim() || "Payment schedule",
          proposalId: proposalId || undefined,
          items: cleanItems.map((it, i) => ({ sequence: i + 1, ...it })),
        }),
      });
      const resBody = await r.json();
      if (!r.ok) throw new Error(resBody.error || "Could not create schedule");

      toast.success("Payment schedule created");
      setOpen(false);
      reload();
      navigate(`/admin/clients/${clientId}/projects/${effectiveProjectId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create schedule");
    } finally {
      setSaving(false);
    }
  };

  const newScheduleSidePanel = (
    <SidePanel
      open={open}
      title="New payment schedule"
      subtitle="A project can carry more than one — each one is sent and tracked independently."
      onClose={() => { if (!saving) setOpen(false); }}
      width={520}
      footer={
        <>
          <button className="crm-btn crm-btn--ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</button>
          <button className="crm-btn crm-btn--primary" onClick={() => void createSchedule()} disabled={saving}>
            {saving ? "Creating…" : "Create schedule"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label className="crm-label">Client *</label>
          <select className="crm-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">— choose a client —</option>
            {clientOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>

        {clientId && (
          <div>
            <label className="crm-label">Project *</label>
            <select className="crm-input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— choose a project —</option>
              {projectsForClient.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="__new__">+ Create a new project…</option>
            </select>
          </div>
        )}

        {creatingNewProject && (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="crm-label">New project name *</label>
              <input className="crm-input" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
            </div>
            <div style={{ width: 160 }}>
              <label className="crm-label">Type</label>
              <select className="crm-input" value={newProjectType} onChange={(e) => setNewProjectType(e.target.value)}>
                {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>
        )}

        {!!proposalOptions.length && (
          <div>
            <label className="crm-label">Link to a proposal (optional)</label>
            <select className="crm-input" value={proposalId} onChange={(e) => setProposalId(e.target.value)}>
              <option value="">— not linked —</option>
              {proposalOptions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="crm-label">Schedule title</label>
          <input className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div>
          <label className="crm-label">Installments</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: "flex", gap: 6 }}>
                <input className="crm-input" style={{ flex: 1 }} placeholder="Label" value={it.label}
                  onChange={(e) => setItems((s) => s.map((x, ix) => ix === i ? { ...x, label: e.target.value } : x))} />
                <input className="crm-input" style={{ width: 110 }} type="number" step="0.01" placeholder="Amount"
                  value={it.amount_dollars}
                  onChange={(e) => setItems((s) => s.map((x, ix) => ix === i ? { ...x, amount_dollars: e.target.value } : x))} />
                <input className="crm-input" style={{ width: 140 }} type="date" value={it.due_date}
                  onChange={(e) => setItems((s) => s.map((x, ix) => ix === i ? { ...x, due_date: e.target.value } : x))} />
                <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => setItems((s) => s.filter((_, ix) => ix !== i))}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
          <button className="crm-btn crm-btn--ghost crm-btn--sm" style={{ marginTop: 8 }}
            onClick={() => setItems((s) => [...s, { label: "", amount_dollars: "", due_date: "" }])}>
            <Plus size={12} /> Add installment
          </button>
        </div>
      </div>
    </SidePanel>
  );

  const invoices = (data?.invoices ?? []) as MoneyInvoice[];
  const buckets = bucketInvoices(invoices);
  const bars = collectedByMonth(invoices);
  const peak = Math.max(1, ...bars.map((b) => b.cents));
  const clientRows = byClient(invoices, Object.keys(data?.clientNames ?? {}));
  const projects = projectMap(data?.projects ?? []);
  const year = new Date().getFullYear();

  const whoFor = (i: MoneyInvoice) =>
    [data?.clientNames[i.client_id], projects[i.client_project_id]?.name].filter(Boolean).join(" · ");

  const run = async (key: string, body: Record<string, unknown>, ok: string) => {
    setActing(key);
    try {
      await callInvoices(body);
      toast.success(ok);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work");
    } finally {
      setActing(null);
    }
  };

  const copyPayLink = async (i: MoneyInvoice) => {
    setActing(i.id);
    try {
      const out = await callInvoices({ action: "payment-link", clientId: i.client_id, invoiceId: i.id });
      const url = (out.url as string) ?? (out.checkoutUrl as string) ?? (out.checkout_url as string);
      if (!url) throw new Error("No pay link on this invoice yet");
      await navigator.clipboard.writeText(url);
      toast.success("Pay link copied");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not get a pay link");
    } finally {
      setActing(null);
    }
  };

  return (
    <AdminLayout topBar={false}>
      <div className="cv-admin cv-page" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
          <div style={{ flex: "1 1 300px", minWidth: 0 }}>
            <h1 className="cv-page-title">Money</h1>
            <p className="cv-page-sub">
              Client invoices across every project: what's been collected,
              what's owed and what bills next.
            </p>
          </div>
          <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 20px" }} onClick={() => setOpen(true)}>
            <Plus size={16} style={{ marginRight: 7 }} /> New invoice
          </button>
        </div>

        <div className="cv-stat-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <div className="cv-card cv-stat cv-stat--left cv-stat--dark">
            <span>Collected in {year}</span>
            <b>{usd(buckets.collectedCents)}</b>
            <small>{buckets.paid.length} invoice{buckets.paid.length === 1 ? "" : "s"} paid</small>
          </div>
          <div className="cv-card cv-stat cv-stat--left">
            <span>Owed to you</span>
            <b>{usd(buckets.owedCents)}</b>
            <small>{buckets.chase.length} sent, unpaid</small>
          </div>
          <div className="cv-card cv-stat cv-stat--left">
            <span>Not billed yet</span>
            <b>{usd(buckets.notBilledCents)}</b>
            <small>{buckets.billsNext.length} scheduled</small>
          </div>
        </div>

        {!data ? (
          <p className="cv-page-sub">Loading…</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
            <div style={{ flex: "3 1 520px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>

              <section className="cv-card cv-card-pad">
                <div className="cv-card-head">
                  <h2 className="cv-card-title">Chase</h2>
                  <span className="cv-chip cv-chip--red">{buckets.chase.length}</span>
                  <span style={{ fontSize: 13, color: "var(--cv-muted)" }}>Sent and still unpaid</span>
                </div>
                {!buckets.chase.length ? (
                  <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
                    Nothing outstanding. Every invoice you have sent has been paid.
                  </p>
                ) : buckets.chase.map((i) => {
                  const days = daysUnpaid(i);
                  return (
                    <div key={i.id} className="cv-hot">
                      <span className="cv-what">
                        <span style={{ fontSize: 16, fontWeight: 600 }}>{i.label}</span>
                        <small>{whoFor(i)}</small>
                        <small>
                          {i.sent_at ? `Sent ${fmtDate(i.sent_at)}` : "Sent"}
                          {i.due_date ? ` · due ${i.due_date}` : " · no due date set"}
                        </small>
                      </span>
                      {days != null && (
                        <span className={`cv-chip cv-chip--${isOverdue(i) ? "red" : days >= 30 ? "amber" : "gray"}`}>
                          {days} day{days === 1 ? "" : "s"} unpaid
                        </span>
                      )}
                      <span className="cv-money-amt" style={{ fontSize: 18 }}>{usd(i.amount_cents)}</span>
                      <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <button
                          type="button" className="cv-open cv-open--dark" style={{ padding: "0 16px" }}
                          disabled={acting === i.id}
                          onClick={() => run(i.id, { action: "email-payment-link", clientId: i.client_id, invoiceId: i.id }, "Reminder sent")}
                        >
                          Email a reminder
                        </button>
                        <button type="button" className="cv-open" style={{ padding: "0 16px" }}
                          disabled={acting === i.id} onClick={() => copyPayLink(i)}>
                          Copy pay link
                        </button>
                        <button
                          type="button" className="cv-open" style={{ padding: "0 16px" }}
                          disabled={acting === i.id}
                          // Voiding is not undoable from here, and an
                          // invoice the client may already have paid
                          // against is exactly the wrong thing to cancel
                          // by misclick.
                          onClick={() => {
                            if (!confirm(`Void "${i.label}" for ${usd(i.amount_cents)}? This cannot be undone.`)) return;
                            run(i.id, { action: "void", clientId: i.client_id, invoiceId: i.id }, "Invoice voided");
                          }}
                        >
                          Void
                        </button>
                      </span>
                    </div>
                  );
                })}
              </section>

              <section className="cv-card cv-card-pad">
                <div className="cv-card-head">
                  <h2 className="cv-card-title">Bills next</h2>
                  <span className="cv-chip cv-chip--gray">{buckets.billsNext.length}</span>
                  <span style={{ fontSize: 13, color: "var(--cv-muted)" }}>Scheduled, not sent</span>
                </div>
                {!buckets.billsNext.length ? (
                  <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
                    Nothing scheduled. Signing a proposal with payment terms puts invoices here.
                  </p>
                ) : buckets.billsNext.map((i) => (
                  <div key={i.id} className="cv-hot">
                    <span className="cv-what">
                      <span style={{ fontSize: 16, fontWeight: 600 }}>{i.label}</span>
                      <small>{whoFor(i)}</small>
                      <small>{billsWhen(i)}</small>
                    </span>
                    <span className="cv-money-amt" style={{ fontSize: 18 }}>{usd(i.amount_cents)}</span>
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <button
                        type="button" className="cv-open cv-open--dark" style={{ padding: "0 16px" }}
                        disabled={acting === i.id}
                        // Sending bills a client. Worth a confirm even
                        // though it is reversible by voiding — the email
                        // is not reversible.
                        onClick={() => {
                          if (!confirm(`Send "${i.label}" for ${usd(i.amount_cents)} to ${data.clientNames[i.client_id] ?? "the client"} now?`)) return;
                          run(i.id, { action: "send", clientId: i.client_id, invoiceId: i.id }, "Invoice sent");
                        }}
                      >
                        Send now
                      </button>
                      <button type="button" className="cv-open" style={{ padding: "0 16px" }}
                        onClick={() => navigate(`/admin/clients/${i.client_id}/projects/${i.client_project_id}`)}>
                        Open project
                      </button>
                    </span>
                  </div>
                ))}
              </section>

              <section className="cv-card cv-card-pad">
                <div className="cv-card-head">
                  <h2 className="cv-card-title">Paid</h2>
                  <span className="cv-chip cv-chip--green">{buckets.paid.length}</span>
                </div>
                {!buckets.paid.length ? (
                  <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>Nothing paid yet.</p>
                ) : buckets.paid.map((i, n) => (
                  <div key={i.id} className={`cv-inv ${n === 0 ? "cv-inv--first" : ""}`}>
                    <span className="cv-what">
                      {i.label}
                      <small>{whoFor(i)}{i.paid_at ? ` · Paid ${fmtDate(i.paid_at)}` : ""}</small>
                    </span>
                    <span className="cv-chip cv-chip--green">Paid</span>
                    <span className="cv-money-amt">{usd(i.amount_cents)}</span>
                  </div>
                ))}
                {buckets.voided.length > 0 && (
                  // Said out loud rather than silently dropped: the
                  // difference between these totals and anyone's own
                  // arithmetic is exactly this money.
                  <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--cv-muted)" }}>
                    Not counted: {buckets.voided.length} voided invoice{buckets.voided.length === 1 ? "" : "s"}
                    {" "}worth {usd(buckets.voided.reduce((s, i) => s + i.amount_cents, 0))}.
                  </p>
                )}
              </section>
            </div>

            <aside style={{ flex: "2 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
              <section className="cv-card cv-card-pad">
                <div className="cv-card-head">
                  <h2 className="cv-card-title">Collected by month</h2>
                  <span style={{ fontSize: 13, color: "var(--cv-muted)" }}>
                    {bars[0]?.label} – {bars[bars.length - 1]?.label} {year}
                  </span>
                </div>
                <div
                  className="cv-bars"
                  style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
                  role="img"
                  aria-label={`Collected by month: ${bars.map((b) => `${b.label} ${usd(b.cents)}`).join(", ")}`}
                >
                  {bars.map((b) => (
                    <div key={b.key}>
                      <b>{shortMoney(b.cents)}</b>
                      <i
                        className={b.cents === 0 ? "cv-bars__zero" : undefined}
                        style={b.cents === 0 ? undefined : { height: `${Math.round((b.cents / peak) * 100)}%` }}
                      />
                      {b.label}
                    </div>
                  ))}
                </div>
              </section>

              <section className="cv-card cv-card-pad">
                <div className="cv-card-head"><h2 className="cv-card-title">By client</h2></div>
                {clientRows.map((r, n) => {
                  const parts = [
                    r.paidCents ? `${usd(r.paidCents)} paid` : null,
                    r.owedCents ? `${usd(r.owedCents)} owed` : null,
                    r.toBillCents ? `${usd(r.toBillCents)} to bill` : null,
                  ].filter(Boolean);
                  return (
                    <button
                      key={r.clientId}
                      type="button"
                      className={`cv-inv ${n === 0 ? "cv-inv--first" : ""}`}
                      style={{ width: "100%", background: "none", border: 0, font: "inherit", cursor: "pointer", textAlign: "left" }}
                      onClick={() => navigate(`/admin/clients/${r.clientId}`)}
                    >
                      <span className="cv-what">
                        {data.clientNames[r.clientId] ?? "Client"}
                        <small>{parts.length ? parts.join(" · ") : "No invoices yet"}</small>
                      </span>
                      <span className={`cv-money-amt ${r.totalCents ? "" : "cv-money-amt--none"}`}>
                        {r.totalCents ? usd(r.totalCents) : "—"}
                      </span>
                    </button>
                  );
                })}
              </section>
            </aside>
          </div>
        )}

        {newScheduleSidePanel}
      </div>
    </AdminLayout>
  );
}

/** "$2.5k" — the label above a bar, where the full figure would not fit. */
function shortMoney(cents: number): string {
  const d = cents / 100;
  if (d === 0) return "$0";
  if (d < 1000) return `$${Math.round(d)}`;
  const k = d / 1000;
  // One decimal only when it changes the number: $2.5k, but $10k not $10.0k.
  return `$${k % 1 === 0 ? k : k.toFixed(1)}k`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
