// The project's Payments tab, laid out to board 6 of the Admin Journeys
// canvas: three figures over the schedules, then one card per schedule
// with its invoices under it.
//
// CRE-803: Paperclip is the source of truth for payment schedules and
// invoices as of the CP-6 cutover, so every action this card used to offer —
// add a schedule, edit one inline, send an invoice through SureCart, open or
// email the pay link, void, delete — is gone. This is a read view now: the
// figures, the schedules and their invoices still show, because Bree needs
// the history, and nothing on this card writes to them any more.
//
// Each removed action called the project-invoices edge function with one
// action key; reviving any of them means reviving exactly that call, not a
// new one:
//
//   await callFn({ action: "create-schedule", clientId, clientProjectId, title, items: [] });
//   await callFn({ action: "schedule", clientId, clientProjectId, scheduleId, items });
//   await callFn({ action: "send", clientId, invoiceId, dueDate });
//   await callFn({ action: "void", clientId, invoiceId });
//   await callFn({ action: "payment-link", clientId, invoiceId });
//   await callFn({ action: "delete", clientId, invoiceId });
//   await callFn({ action: "email-payment-link", clientId, invoiceId, contactIds, additionalEmails });
//
// The money is worked out from the invoices rather than from
// schedule.total_cents: a schedule created from a proposal carries a
// total that stops matching the moment someone edits a line, and two
// numbers for one question is how a page loses its reader's trust.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import EmptyState from "@/components/admin/cv/EmptyState";
import { ReadOnlyNotice } from "@/components/admin/ReadOnlyNotice";
import { usd } from "@/lib/clientBalance";
import { invoiceSummary, invoiceLine, INVOICE_STATUS } from "@/lib/projectInvoices";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export type Invoice = {
  id: string;
  schedule_id: string | null;
  sequence: number;
  label: string;
  amount_cents: number;
  currency: string;
  due_date: string | null;
  status: "scheduled" | "sent" | "paid" | "void" | "failed";
  surecart_invoice_id: string | null;
  checkout_url: string | null;
  sent_at: string | null;
  paid_at: string | null;
  notes: string | null;
};

export type Schedule = {
  id: string;
  title: string;
  status: "active" | "archived";
  source: "proposal" | "manual";
  proposal_id: string | null;
  total_cents: number | null;
  currency: string;
  invoices: Invoice[];
};

export default function ProjectInvoicesCard({
  clientId, clientProjectId,
}: { clientId: string; clientProjectId: string }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);

  const callFn = async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const r = await fetch(`${SUPABASE_URL}/functions/v1/project-invoices`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Request failed");
    return data;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callFn({ action: "list-schedules", clientId, clientProjectId });
      setSchedules((data.schedules ?? []) as Schedule[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load payment schedules");
    } finally { setLoading(false); }
  }, [clientId, clientProjectId]);

  useEffect(() => { void load(); }, [load]);

  const sum = invoiceSummary(schedules);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          <div className="cv-moneytile cv-moneytile--dark"><span>Total</span><b>{usd(sum.totalCents)}</b></div>
          <div className="cv-moneytile"><span>Paid</span><b>{usd(sum.paidCents)}</b></div>
          <div className="cv-moneytile"><span>Remaining</span><b>{usd(sum.remainingCents)}</b></div>
        </div>
        <span className="cv-bar"><i style={{ width: `${sum.pct}%` }} /></span>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
          <span style={{ flex: "1 1 220px", fontSize: 14, color: "var(--cv-muted)" }}>
            {sum.blurb}
          </span>
          <ReadOnlyNotice subject="payment schedule list" />
        </div>
      </section>

      {loading && (
        <section className="cv-card cv-card-pad">
          <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>Loading…</p>
        </section>
      )}

      {!loading && !schedules.length && (
        <EmptyState
          title="No payment schedule yet"
          subtitle="This project has no payment schedule on file."
        />
      )}

      {!loading && schedules.map((schedule) => {
        const total = schedule.invoices.reduce((s, i) => s + i.amount_cents, 0);
        const paid = schedule.invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount_cents, 0);
        return (
          <section key={schedule.id} className="cv-card cv-card-pad"
            style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <h2 className="cv-card-title">{schedule.title}</h2>
              <span className={`cv-chip ${schedule.source === "proposal" ? "cv-chip--blue" : "cv-chip--gray"}`}>
                {schedule.source === "proposal" ? "From signed proposal" : "Added by hand"}
              </span>
              <span style={{ marginLeft: "auto", fontSize: 14, color: "var(--cv-muted)" }}>
                {usd(paid)} of {usd(total)}
              </span>
            </div>

            {!schedule.invoices.length && (
              <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
                No invoices on this schedule.
              </p>
            )}

            {schedule.invoices.map((inv, i) => {
              const st = INVOICE_STATUS[inv.status] ?? INVOICE_STATUS.scheduled;
              return (
                <div key={inv.id} className={`cv-inv ${i === 0 ? "cv-inv--first" : ""}`}>
                  <span className="cv-seq">{inv.sequence}</span>
                  <span className="cv-what">
                    {inv.label}
                    <small>{invoiceLine(inv)}</small>
                  </span>
                  <span className="cv-money-amt">{usd(inv.amount_cents)}</span>
                  <span className={`cv-chip ${st.cls}`}>{st.label}</span>
                  <ReadOnlyNotice subject="invoice" />
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
