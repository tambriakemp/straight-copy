import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { ReadOnlyNotice } from "@/components/admin/ReadOnlyNotice";
import { loadAdminOperations, projectMap, type AdminOperations } from "@/lib/adminOperations";
import { usd } from "@/lib/clientBalance";
import {
  bucketInvoices, collectedByMonth, byClient, daysUnpaid, isOverdue, billsWhen,
  type MoneyInvoice,
} from "@/lib/moneyRollup";

// CRE-803: Paperclip is the source of truth for payment schedules and
// invoices as of the CP-6 cutover, so the "New invoice" panel and every
// per-invoice action below (email a reminder, copy pay link, void, send now)
// are gone. They called the project-invoices edge function with
// {action: "create-schedule" | "email-payment-link" | "payment-link" | "void" | "send", ...} —
// reviving any of them means reviving exactly that call. The schedule/project
// creation that used to back "New invoice" is kept as a comment, not deleted:
//
//   if (creatingNewProject) {
//     const { data: proj } = await supabase.from("client_projects").insert({
//       client_id: clientId, name: newProjectName, type: newProjectType,
//     }).select("id").single();
//   }
//   await fetch(`${SUPABASE_URL}/functions/v1/project-invoices`, { method: "POST", body: JSON.stringify({
//     action: "create-schedule", clientId, clientProjectId, title, proposalId, items,
//   }) });

export default function Payments() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminOperations | null>(null);
  const reload = () => loadAdminOperations().then(setData).catch((error) => toast.error(error.message || "Failed to load payments"));
  useEffect(() => { reload(); }, []);

  const invoices = (data?.invoices ?? []) as MoneyInvoice[];
  const buckets = bucketInvoices(invoices);
  const bars = collectedByMonth(invoices);
  const peak = Math.max(1, ...bars.map((b) => b.cents));
  const clientRows = byClient(invoices, Object.keys(data?.clientNames ?? {}));
  const projects = projectMap(data?.projects ?? []);
  const year = new Date().getFullYear();

  const whoFor = (i: MoneyInvoice) =>
    [data?.clientNames[i.client_id], projects[i.client_project_id]?.name].filter(Boolean).join(" · ");

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
          <ReadOnlyNotice subject="invoice list" />
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
                      <ReadOnlyNotice subject="invoice" />
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
                    <span style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <ReadOnlyNotice subject="invoice" />
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
