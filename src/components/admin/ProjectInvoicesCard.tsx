import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Send, Ban, ExternalLink, Mail, X } from "lucide-react";
import Panel, { PanelButton } from "@/components/admin/project/PanelChrome";
import { T } from "@/lib/cre8Design";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type Invoice = {
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

type Schedule = {
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

const fmtUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

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

  const load = async () => {
    setLoading(true);
    try {
      const data = await callFn({ action: "list-schedules", clientId, clientProjectId });
      setSchedules((data.schedules ?? []) as Schedule[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load payment schedules");
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [clientId, clientProjectId]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("client_contacts")
        .select("id, name, email, is_primary")
        .eq("client_id", clientId)
        .order("is_primary", { ascending: false });
      if (!cancel) setContacts((data ?? []).filter(c => !!c.email));
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
    const extras = emailDialog.extra
      .split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    const invalid = extras.filter(e => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
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
      toast.success(`Sent to ${r.sent} recipient${r.sent === 1 ? "" : "s"}${failed.length ? ` · ${failed.length} failed` : ""}`, { id: t });
      setEmailDialog(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed", { id: t });
    } finally { setSending(false); }
  };

  const beginEdit = (schedule: Schedule) => {
    setDrafts(schedule.invoices.length
      ? schedule.invoices.map(i => ({
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
      const r = await callFn({ action: "create-schedule", clientId, clientProjectId, title: "Payment schedule", items: [] });
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
      const items = drafts.map(d => ({
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
      const r = await callFn({
        action: "send", clientId, invoiceId: inv.id,
        dueDate: inv.due_date,
      });
      if (r.checkoutUrl) {
        try { await navigator.clipboard.writeText(r.checkoutUrl); } catch { /* ignore */ }
        toast.success(`Invoice sent — pay link copied to clipboard`, { id: t });
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

  const statusColor = (s: Invoice["status"]) => {
    if (s === "paid") return { bg: "hsl(120 30% 50% / 0.15)", fg: "hsl(120 60% 70%)" };
    if (s === "sent") return { bg: "hsl(40 80% 50% / 0.15)", fg: "hsl(40 80% 70%)" };
    if (s === "failed") return { bg: "hsl(0 50% 50% / 0.15)", fg: "hsl(0 60% 70%)" };
    if (s === "void") return { bg: "hsl(0 20% 50% / 0.15)", fg: "hsl(0 30% 70%)" };
    return { bg: "hsl(40 20% 97% / 0.06)", fg: "var(--crm-taupe)" };
  };

  const grandTotal = schedules.reduce((s, sc) => s + sc.invoices.reduce((ss, i) => ss + i.amount_cents, 0), 0);
  const grandPaid = schedules.reduce((s, sc) => s + sc.invoices.filter(i => i.status === "paid").reduce((ss, i) => ss + i.amount_cents, 0), 0);

  return (
    <Panel
      title="Payments"
      meta={schedules.length > 0
        ? <span style={{ fontSize: 14, color: T.text2 }}>{fmtUSD(grandPaid)} of {fmtUSD(grandTotal)}</span>
        : undefined}
      actions={
        <PanelButton onClick={addSchedule} disabled={creatingSchedule}>
          <Plus size={14} /> {creatingSchedule ? "Adding…" : "Add schedule"}
        </PanelButton>
      }
    >
      <div>
      {loading && <div style={{ color: T.muted, fontSize: 15, padding: "18px" }}>Loading…</div>}

      {!loading && schedules.length === 0 && (
        <div style={{ color: T.muted, fontSize: 15, padding: 18 }}>
          No payment schedule yet. Add one to invoice the client through SureCart, or wait for a signed
          proposal with terms to create one automatically.
        </div>
      )}

      {!loading && schedules.map((schedule, si) => {
        const editing = editingScheduleId === schedule.id;
        const total = schedule.invoices.reduce((s, i) => s + i.amount_cents, 0);
        const paid = schedule.invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount_cents, 0);
        return (
          <div key={schedule.id} style={{ borderTop: si === 0 ? "none" : T.hairline }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 18px", background: "hsl(40 20% 97% / 0.03)",
            }}>
              <div style={{ fontSize: 14, color: T.text2 }}>
                {schedule.title}
                {schedule.source === "proposal" && (
                  <span style={{ marginLeft: 8, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>
                    from signed proposal
                  </span>
                )}
                {schedule.invoices.length > 0 && (
                  <span style={{ marginLeft: 8, color: T.muted }}>· {fmtUSD(paid)} of {fmtUSD(total)}</span>
                )}
              </div>
              {!editing && (
                <PanelButton onClick={() => beginEdit(schedule)}>
                  <Plus size={14} /> Edit
                </PanelButton>
              )}
            </div>

            <div style={{ padding: editing ? "14px 18px" : 0 }}>
              {!editing && schedule.invoices.length === 0 && (
                <div style={{ color: T.muted, fontSize: 15, padding: 18 }}>No invoices on this schedule yet.</div>
              )}

              {!editing && schedule.invoices.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {schedule.invoices.map(inv => {
                    const sc = statusColor(inv.status);
                    return (
                      <div key={inv.id} className="crm-invoice-row">
                        <div className="crm-invoice-row__seq" style={{ fontFamily: "var(--crm-font-serif)", fontSize: 15, color: "var(--crm-taupe)", width: 22, textAlign: "center" }}>
                          {inv.sequence}
                        </div>
                        <div className="crm-invoice-row__label">
                          <div style={{ color: "var(--crm-warm-white)", fontSize: 15 }}>{inv.label}</div>
                          <div className="crm-invoice-row__meta" style={{ fontSize: 13, color: "var(--crm-taupe)" }}>
                            {inv.due_date ? `Due ${new Date(inv.due_date).toLocaleDateString()}` : "No due date"}
                            {inv.paid_at && ` · Paid ${new Date(inv.paid_at).toLocaleDateString()}`}
                            {inv.sent_at && !inv.paid_at && ` · Sent ${new Date(inv.sent_at).toLocaleDateString()}`}
                          </div>
                        </div>
                        <div className="crm-invoice-row__amount" style={{ color: "var(--crm-warm-white)", fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
                          {fmtUSD(inv.amount_cents)}
                        </div>
                        <span className="crm-invoice-row__status" style={{
                          fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase",
                          padding: "3px 9px", borderRadius: 999, background: sc.bg, color: sc.fg,
                          whiteSpace: "nowrap",
                        }}>{inv.status}</span>
                        <div className="crm-invoice-row__actions">
                          {(inv.status === "scheduled" || inv.status === "failed") && (
                            <>
                              <button className="crm-btn crm-btn--primary crm-btn--sm" disabled={busy === inv.id}
                                onClick={() => sendInvoice(inv)} title="Send via SureCart">
                                <Send size={12} /> {busy === inv.id ? "Sending…" : "Send"}
                              </button>
                              <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => deleteInvoice(inv)} disabled={busy === inv.id} title="Delete">
                                <Trash2 size={12} />
                              </button>
                            </>
                          )}
                          {inv.status === "sent" && (
                            <>
                              {inv.checkout_url && (
                                <button className="crm-btn crm-btn--ghost crm-btn--sm"
                                  onClick={() => openPayLink(inv)} disabled={busy === inv.id}>
                                  <ExternalLink size={12} /> Pay link
                                </button>
                              )}
                              <button className="crm-btn crm-btn--ghost crm-btn--sm"
                                onClick={() => openEmailDialog(inv)} disabled={busy === inv.id}
                                title="Email payment link">
                                <Mail size={12} /> Email
                              </button>
                              <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => voidInvoice(inv)} disabled={busy === inv.id}>
                                <Ban size={12} /> Void
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {editing && (
                <div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    {drafts.map((d, i) => {
                      const locked = !!d.id && schedule.invoices.find(x => x.id === d.id)?.status !== "scheduled";
                      return (
                        <div key={i} className="crm-invoice-edit-row">
                          <input className="crm-input" type="number" min={1} value={d.sequence} disabled={locked}
                            onChange={e => setDrafts(s => s.map((x, ix) => ix === i ? { ...x, sequence: parseInt(e.target.value) || 1 } : x))} />
                          <input className="crm-input" placeholder="Label (e.g. Deposit)" value={d.label} disabled={locked}
                            onChange={e => setDrafts(s => s.map((x, ix) => ix === i ? { ...x, label: e.target.value } : x))} />
                          <input className="crm-input" type="number" step="0.01" placeholder="Amount" value={d.amount_dollars} disabled={locked}
                            onChange={e => setDrafts(s => s.map((x, ix) => ix === i ? { ...x, amount_dollars: e.target.value } : x))} />
                          <input className="crm-input" type="date" value={d.due_date} disabled={locked}
                            onChange={e => setDrafts(s => s.map((x, ix) => ix === i ? { ...x, due_date: e.target.value } : x))} />
                          <button className="crm-btn crm-btn--ghost crm-btn--sm" disabled={locked}
                            onClick={() => setDrafts(s => s.filter((_, ix) => ix !== i))}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <button className="crm-btn crm-btn--ghost crm-btn--sm"
                    onClick={() => setDrafts(s => [...s, { sequence: s.length + 1, label: "", amount_dollars: "", due_date: "" }])}>
                    <Plus size={12} /> Add invoice
                  </button>
                  <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                    <button className="crm-btn crm-btn--ghost" onClick={() => setEditingScheduleId(null)}>Cancel</button>
                    <button className="crm-btn crm-btn--primary" onClick={saveSchedule}>Save schedule</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>

      <Dialog open={!!emailDialog} onOpenChange={(o) => !o && setEmailDialog(null)}>
        <DialogContent data-mobile-bottom-sheet="true" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Email payment link</DialogTitle>
            <DialogDescription>
              {emailDialog?.invoice.label} · {emailDialog && fmtUSD(emailDialog.invoice.amount_cents)}
            </DialogDescription>
          </DialogHeader>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--crm-taupe)", marginBottom: 8 }}>
                Client contacts
              </div>
              {contacts.length === 0 ? (
                <div style={{ fontSize: 16, color: "var(--crm-taupe)" }}>
                  No contacts with email on file. Add contacts on the client page, or use additional emails below.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {contacts.map(c => {
                    const checked = emailDialog?.selected.has(c.id) ?? false;
                    return (
                      <label key={c.id} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                        border: "1px solid var(--crm-border-dark)", borderRadius: 6, cursor: "pointer",
                        background: checked ? "hsl(40 20% 97% / 0.05)" : "transparent",
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => setEmailDialog(d => {
                            if (!d) return d;
                            const next = new Set(d.selected);
                            if (e.target.checked) next.add(c.id); else next.delete(c.id);
                            return { ...d, selected: next };
                          })}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ color: "var(--crm-warm-white)", fontSize: 16 }}>
                            {c.name || c.email}
                          </div>
                          {c.name && (
                            <div style={{ fontSize: 14, color: "var(--crm-taupe)" }}>{c.email}</div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 14, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--crm-taupe)", marginBottom: 8 }}>
                Additional emails
              </div>
              <input
                className="crm-input"
                style={{ width: "100%" }}
                placeholder="name@example.com, another@example.com"
                value={emailDialog?.extra ?? ""}
                onChange={(e) => setEmailDialog(d => d ? { ...d, extra: e.target.value } : d)}
              />
              <div style={{ fontSize: 14, color: "var(--crm-taupe)", marginTop: 6 }}>
                Comma or space separated.
              </div>
            </div>
          </div>

          <DialogFooter>
            <button className="crm-btn crm-btn--ghost" onClick={() => setEmailDialog(null)} disabled={sending}>
              <X size={12} /> Cancel
            </button>
            <button className="crm-btn crm-btn--primary" onClick={sendEmailLink} disabled={sending}>
              <Send size={12} /> {sending ? "Sending…" : "Send link"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
