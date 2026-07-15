import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Send, Ban, ExternalLink, DollarSign, Mail, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type Invoice = {
  id: string;
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
  clientId, clientProjectId, embedded,
}: { clientId: string; clientProjectId: string; embedded?: boolean }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
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
      const data = await callFn({ action: "list", clientId, clientProjectId });
      setInvoices((data.invoices ?? []) as Invoice[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load invoices");
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

  const beginEdit = () => {
    if (invoices.length === 0) {
      // Default 3x$5000 prefill
      setDrafts([
        { sequence: 1, label: "Deposit", amount_dollars: "5000", due_date: "" },
        { sequence: 2, label: "Milestone 2", amount_dollars: "5000", due_date: "" },
        { sequence: 3, label: "Final", amount_dollars: "5000", due_date: "" },
      ]);
    } else {
      setDrafts(invoices.map(i => ({
        id: i.id, sequence: i.sequence, label: i.label,
        amount_dollars: (i.amount_cents / 100).toString(),
        due_date: i.due_date ?? "",
        notes: i.notes,
      })));
    }
    setEditing(true);
  };

  const saveSchedule = async () => {
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
      await callFn({ action: "schedule", clientId, clientProjectId, items });
      toast.success("Schedule saved");
      setEditing(false);
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

  const total = invoices.reduce((s, i) => s + i.amount_cents, 0);
  const paid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount_cents, 0);

  const statusColor = (s: Invoice["status"]) => {
    if (s === "paid") return { bg: "hsl(120 30% 50% / 0.15)", fg: "hsl(120 60% 70%)" };
    if (s === "sent") return { bg: "hsl(40 80% 50% / 0.15)", fg: "hsl(40 80% 70%)" };
    if (s === "failed") return { bg: "hsl(0 50% 50% / 0.15)", fg: "hsl(0 60% 70%)" };
    if (s === "void") return { bg: "hsl(0 20% 50% / 0.15)", fg: "hsl(0 30% 70%)" };
    return { bg: "hsl(40 20% 97% / 0.06)", fg: "var(--crm-taupe)" };
  };

  return (
    <div style={embedded ? { padding: 0 } : {
      background: "hsl(40 20% 97% / 0.03)",
      border: "1px solid var(--crm-border-dark)",
      borderRadius: 12, padding: "22px 24px", marginTop: 24,
    }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-accent)", marginBottom: 4, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <DollarSign size={12} /> Payment Schedule
          </div>
          <h3 style={{ fontFamily: "var(--crm-font-serif)", fontWeight: 300, fontSize: 24, color: "var(--crm-warm-white)", margin: 0 }}>
            Invoices {invoices.length > 0 && <span style={{ color: "var(--crm-taupe)", fontSize: 18 }}>· {fmtUSD(paid)} of {fmtUSD(total)} paid</span>}
          </h3>
        </div>
        {!editing && (
          <button className="crm-btn crm-btn--ghost" onClick={beginEdit}>
            {invoices.length === 0 ? <><Plus size={14} /> Set up schedule</> : "Edit schedule"}
          </button>
        )}
      </div>

      {loading && <div style={{ color: "var(--crm-taupe)" }}>Loading…</div>}

      {!loading && !editing && invoices.length === 0 && (
        <div style={{ color: "var(--crm-taupe)", fontSize: 16, padding: "16px 0" }}>
          No payment schedule yet. Set up milestones to invoice the client through SureCart.
        </div>
      )}

      {!loading && !editing && invoices.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {invoices.map(inv => {
            const sc = statusColor(inv.status);
            return (
              <div key={inv.id} className="crm-invoice-row">
                <div className="crm-invoice-row__seq" style={{ fontFamily: "var(--crm-font-serif)", fontSize: 20, color: "var(--crm-taupe)", width: 28, textAlign: "center" }}>
                  {inv.sequence}
                </div>
                <div className="crm-invoice-row__label">
                  <div style={{ color: "var(--crm-warm-white)", fontSize: 17 }}>{inv.label}</div>
                  <div className="crm-invoice-row__meta" style={{ fontSize: 14, color: "var(--crm-taupe)" }}>
                    {inv.due_date ? `Due ${new Date(inv.due_date).toLocaleDateString()}` : "No due date"}
                    {inv.paid_at && ` · Paid ${new Date(inv.paid_at).toLocaleDateString()}`}
                    {inv.sent_at && !inv.paid_at && ` · Sent ${new Date(inv.sent_at).toLocaleDateString()}`}
                  </div>
                </div>
                <div className="crm-invoice-row__amount" style={{ color: "var(--crm-warm-white)", fontSize: 18, fontVariantNumeric: "tabular-nums" }}>
                  {fmtUSD(inv.amount_cents)}
                </div>
                <span className="crm-invoice-row__status" style={{
                  fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase",
                  padding: "3px 9px", borderRadius: 999, background: sc.bg, color: sc.fg,
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
              const locked = !!d.id && invoices.find(x => x.id === d.id)?.status !== "scheduled";
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
            <button className="crm-btn crm-btn--ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button className="crm-btn crm-btn--primary" onClick={saveSchedule}>Save schedule</button>
          </div>
        </div>
      )}

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
              <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--crm-taupe)", marginBottom: 8 }}>
                Client contacts
              </div>
              {contacts.length === 0 ? (
                <div style={{ fontSize: 14, color: "var(--crm-taupe)" }}>
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
                          <div style={{ color: "var(--crm-warm-white)", fontSize: 14 }}>
                            {c.name || c.email}
                          </div>
                          {c.name && (
                            <div style={{ fontSize: 12, color: "var(--crm-taupe)" }}>{c.email}</div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--crm-taupe)", marginBottom: 8 }}>
                Additional emails
              </div>
              <input
                className="crm-input"
                style={{ width: "100%" }}
                placeholder="name@example.com, another@example.com"
                value={emailDialog?.extra ?? ""}
                onChange={(e) => setEmailDialog(d => d ? { ...d, extra: e.target.value } : d)}
              />
              <div style={{ fontSize: 12, color: "var(--crm-taupe)", marginTop: 6 }}>
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
    </div>
  );
}
