// The project's Payments tab, laid out to board 6 of the Admin Journeys
// canvas: three figures over the schedules, then one card per schedule
// with its invoices under it.
//
// It was the last dark panel on a light page. Everything it could do it
// still does — add a schedule, edit one inline, send an invoice through
// SureCart, open or email the pay link, void, delete — because a
// redesign that drops an action is a feature removal wearing a new
// coat. Only the chrome changed.
//
// The money is worked out from the invoices rather than from
// schedule.total_cents: a schedule created from a proposal carries a
// total that stops matching the moment someone edits a line, and two
// numbers for one question is how a page loses its reader's trust.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Send, Ban, ExternalLink, Mail, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import EmptyState from "@/components/admin/cv/EmptyState";
import { usd } from "@/lib/clientBalance";
import { invoiceSummary, invoiceLine, INVOICE_STATUS } from "@/lib/projectInvoices";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

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

type DraftItem = {
  id?: string;
  sequence: number;
  label: string;
  amount_dollars: string;
  due_date: string;
  notes?: string | null;
};

export default function ProjectInvoicesCard({
  clientId, clientProjectId,
}: { clientId: string; clientProjectId: string }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [creatingSchedule, setCreatingSchedule] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [contacts, setContacts] = useState<{ id: string; name: string | null; email: string | null }[]>([]);
  const [emailDialog, setEmailDialog] = useState<{ invoice: Invoice; selected: Set<string>; extra: string } | null>(null);
  const [sending, setSending] = useState(false);

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

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("client_contacts")
        .select("id, name, email, is_primary")
        .eq("client_id", clientId)
        .order("is_primary", { ascending: false });
      if (!cancel) setContacts((data ?? []).filter((c) => !!c.email));
    })();
    return () => { cancel = true; };
  }, [clientId]);

  const openEmailDialog = (inv: Invoice) => {
    const preselect = new Set<string>();
    if (contacts[0]) preselect.add(contacts[0].id);
    setEmailDialog({ invoice: inv, selected: preselect, extra: "" });
  };

  const sendEmailLink = async () => {
    if (!emailDialog) return;
    const extras = emailDialog.extra.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const invalid = extras.filter((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (invalid.length) { toast.error(`Invalid email: ${invalid[0]}`); return; }
    if (emailDialog.selected.size === 0 && extras.length === 0) {
      toast.error("Pick at least one recipient"); return;
    }
    setSending(true);
    const t = toast.loading("Sending payment link…");
    try {
      const r = await callFn({
        action: "email-payment-link",
        clientId,
        invoiceId: emailDialog.invoice.id,
        contactIds: Array.from(emailDialog.selected),
        additionalEmails: extras,
      });
      const failed = (r.results ?? []).filter((x: { ok: boolean }) => !x.ok);
      if (failed.length && r.sent === 0) throw new Error(failed[0].error || "Send failed");
      toast.success(
        `Sent to ${r.sent} recipient${r.sent === 1 ? "" : "s"}${failed.length ? ` · ${failed.length} failed` : ""}`,
        { id: t },
      );
      setEmailDialog(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed", { id: t });
    } finally { setSending(false); }
  };

  const beginEdit = (schedule: Schedule) => {
    setDrafts(schedule.invoices.length
      ? schedule.invoices.map((i) => ({
        id: i.id, sequence: i.sequence, label: i.label,
        amount_dollars: (i.amount_cents / 100).toString(),
        due_date: i.due_date ?? "",
        notes: i.notes,
      }))
      : [{ sequence: 1, label: "", amount_dollars: "", due_date: "" }]);
    setEditingScheduleId(schedule.id);
  };

  const addSchedule = async () => {
    setCreatingSchedule(true);
    try {
      const r = await callFn({
        action: "create-schedule", clientId, clientProjectId, title: "Payment schedule", items: [],
      });
      await load();
      setDrafts([{ sequence: 1, label: "", amount_dollars: "", due_date: "" }]);
      setEditingScheduleId(r.schedule.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create schedule");
    } finally { setCreatingSchedule(false); }
  };

  const saveSchedule = async () => {
    if (!editingScheduleId) return;
    try {
      const items = drafts.map((d) => ({
        id: d.id,
        sequence: d.sequence,
        label: d.label.trim(),
        amount_cents: Math.round(parseFloat(d.amount_dollars || "0") * 100),
        due_date: d.due_date || null,
        notes: d.notes ?? null,
      }));
      for (const it of items) {
        if (!it.label) throw new Error("Each invoice needs a label");
        if (!it.amount_cents || it.amount_cents < 100) throw new Error(`${it.label}: amount must be at least $1`);
      }
      if (!items.length) throw new Error("Add at least one invoice, or delete this schedule");
      await callFn({ action: "schedule", clientId, clientProjectId, scheduleId: editingScheduleId, items });
      toast.success("Schedule saved");
      setEditingScheduleId(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  };

  const sendInvoice = async (inv: Invoice) => {
    setBusy(inv.id);
    const t = toast.loading(`Sending "${inv.label}" via SureCart…`);
    try {
      const r = await callFn({ action: "send", clientId, invoiceId: inv.id, dueDate: inv.due_date });
      if (r.checkoutUrl) {
        try { await navigator.clipboard.writeText(r.checkoutUrl); } catch { /* ignore */ }
        toast.success("Invoice sent — pay link copied to clipboard", { id: t });
      } else {
        toast.success("Invoice sent", { id: t });
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed", { id: t });
    } finally { setBusy(null); }
  };

  const voidInvoice = async (inv: Invoice) => {
    if (!confirm(`Void invoice "${inv.label}"?`)) return;
    setBusy(inv.id);
    try {
      await callFn({ action: "void", clientId, invoiceId: inv.id });
      toast.success("Invoice voided");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Void failed");
    } finally { setBusy(null); }
  };

  const openPayLink = async (inv: Invoice) => {
    setBusy(inv.id);
    const t = toast.loading("Preparing payment link…");
    try {
      const r = await callFn({ action: "payment-link", clientId, invoiceId: inv.id });
      if (!r.checkoutUrl) throw new Error("No payment link available yet");
      window.open(r.checkoutUrl, "_blank", "noopener");
      await load();
      toast.success("Payment link opened", { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open payment link", { id: t });
    } finally { setBusy(null); }
  };

  const deleteInvoice = async (inv: Invoice) => {
    if (!confirm(`Delete invoice "${inv.label}"?`)) return;
    setBusy(inv.id);
    try {
      await callFn({ action: "delete", clientId, invoiceId: inv.id });
      toast.success("Deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally { setBusy(null); }
  };

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
          <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 18px" }}
            onClick={addSchedule} disabled={creatingSchedule}>
            <Plus size={15} style={{ marginRight: 7 }} />
            {creatingSchedule ? "Adding…" : "Add schedule"}
          </button>
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
          subtitle="Add one to invoice the client through SureCart, or wait for a signed proposal with terms to create one."
        />
      )}

      {!loading && schedules.map((schedule) => {
        const editing = editingScheduleId === schedule.id;
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
              {!editing && (
                <button type="button" className="cv-open" style={{ padding: "0 18px" }} onClick={() => beginEdit(schedule)}>
                  Edit
                </button>
              )}
            </div>

            {!editing && !schedule.invoices.length && (
              <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
                No invoices on this schedule yet. Edit it to add the first.
              </p>
            )}

            {!editing && schedule.invoices.map((inv, i) => {
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
                  <span className="cv-invacts">
                    {(inv.status === "scheduled" || inv.status === "failed") && (
                      <>
                        <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 14px", minHeight: 40 }}
                          disabled={busy === inv.id} onClick={() => sendInvoice(inv)} title="Send via SureCart">
                          <Send size={13} style={{ marginRight: 6 }} />
                          {busy === inv.id ? "Sending…" : "Send"}
                        </button>
                        <button type="button" className="cv-mini cv-mini--danger"
                          disabled={busy === inv.id} onClick={() => deleteInvoice(inv)} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                    {inv.status === "sent" && (
                      <>
                        {inv.checkout_url && (
                          <button type="button" className="cv-mini" disabled={busy === inv.id}
                            onClick={() => openPayLink(inv)} title="Open the pay link">
                            <ExternalLink size={14} />
                          </button>
                        )}
                        <button type="button" className="cv-mini" disabled={busy === inv.id}
                          onClick={() => openEmailDialog(inv)} title="Email the payment link">
                          <Mail size={14} />
                        </button>
                        <button type="button" className="cv-mini" disabled={busy === inv.id}
                          onClick={() => voidInvoice(inv)} title="Void this invoice">
                          <Ban size={14} />
                        </button>
                      </>
                    )}
                  </span>
                </div>
              );
            })}

            {editing && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {drafts.map((d, i) => {
                  // A sent or paid invoice is a fact the client has seen.
                  // Editing it here would change what we claim we billed.
                  const locked = !!d.id && schedule.invoices.find((x) => x.id === d.id)?.status !== "scheduled";
                  return (
                    <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <input className="cv-input" type="number" min={1} value={d.sequence} disabled={locked}
                        style={{ flex: "0 0 70px" }}
                        onChange={(e) => setDrafts((s) => s.map((x, ix) => ix === i ? { ...x, sequence: parseInt(e.target.value) || 1 } : x))} />
                      <input className="cv-input" placeholder="Label (e.g. Deposit)" value={d.label} disabled={locked}
                        style={{ flex: "2 1 180px" }}
                        onChange={(e) => setDrafts((s) => s.map((x, ix) => ix === i ? { ...x, label: e.target.value } : x))} />
                      <input className="cv-input" type="number" step="0.01" placeholder="Amount" value={d.amount_dollars} disabled={locked}
                        style={{ flex: "1 1 110px" }}
                        onChange={(e) => setDrafts((s) => s.map((x, ix) => ix === i ? { ...x, amount_dollars: e.target.value } : x))} />
                      <input className="cv-input" type="date" value={d.due_date} disabled={locked}
                        style={{ flex: "1 1 150px" }}
                        onChange={(e) => setDrafts((s) => s.map((x, ix) => ix === i ? { ...x, due_date: e.target.value } : x))} />
                      <button type="button" className="cv-mini cv-mini--danger" disabled={locked}
                        onClick={() => setDrafts((s) => s.filter((_, ix) => ix !== i))}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
                  <button type="button" className="cv-open" style={{ padding: "0 16px" }}
                    onClick={() => setDrafts((s) => [...s, { sequence: s.length + 1, label: "", amount_dollars: "", due_date: "" }])}>
                    <Plus size={14} style={{ marginRight: 6 }} /> Add invoice
                  </button>
                  <span style={{ flex: 1 }} />
                  <button type="button" className="cv-open" style={{ padding: "0 16px" }}
                    onClick={() => setEditingScheduleId(null)}>
                    Cancel
                  </button>
                  <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 16px" }}
                    onClick={saveSchedule}>
                    Save schedule
                  </button>
                </div>
              </div>
            )}
          </section>
        );
      })}

      <Dialog open={!!emailDialog} onOpenChange={(o) => !o && setEmailDialog(null)}>
        <DialogContent data-mobile-bottom-sheet="true" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Email payment link</DialogTitle>
            <DialogDescription>
              {emailDialog?.invoice.label} · {emailDialog && usd(emailDialog.invoice.amount_cents)}
            </DialogDescription>
          </DialogHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div className="cv-field" style={{ marginBottom: 8 }}>Client contacts</div>
              {!contacts.length ? (
                <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
                  No contacts with an email on file. Add one on the client page, or use
                  additional emails below.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {contacts.map((c) => {
                    const checked = emailDialog?.selected.has(c.id) ?? false;
                    return (
                      <label key={c.id} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                        border: "1px solid var(--cv-border-strong)", borderRadius: 12, cursor: "pointer",
                        background: checked ? "var(--cv-accent-tint)" : "transparent",
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setEmailDialog((d) => {
                            if (!d) return d;
                            const next = new Set(d.selected);
                            if (e.target.checked) next.add(c.id); else next.delete(c.id);
                            return { ...d, selected: next };
                          })}
                        />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: "block", fontSize: 15 }}>{c.name || c.email}</span>
                          {c.name && (
                            <span style={{ display: "block", fontSize: 13, color: "var(--cv-muted)" }}>{c.email}</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <label className="cv-field">
              Additional emails
              <input
                className="cv-input"
                placeholder="name@example.com, another@example.com"
                value={emailDialog?.extra ?? ""}
                onChange={(e) => setEmailDialog((d) => d ? { ...d, extra: e.target.value } : d)}
              />
            </label>
          </div>

          <DialogFooter>
            <button type="button" className="cv-open" style={{ padding: "0 18px" }}
              onClick={() => setEmailDialog(null)} disabled={sending}>
              <X size={14} style={{ marginRight: 6 }} /> Cancel
            </button>
            <button type="button" className="cv-open cv-open--dark" style={{ padding: "0 18px" }}
              onClick={sendEmailLink} disabled={sending}>
              <Send size={14} style={{ marginRight: 6 }} /> {sending ? "Sending…" : "Send link"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
