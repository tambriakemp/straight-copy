import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Send, Ban, ExternalLink, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  clientId, clientProjectId,
}: { clientId: string; clientProjectId: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [sendDialog, setSendDialog] = useState<{ inv: Invoice; priceId: string } | null>(null);

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

  const sendInvoice = async (inv: Invoice, priceId: string) => {
    if (!priceId.trim()) return toast.error("Enter SureCart Price ID");
    setBusy(inv.id);
    try {
      const r = await callFn({
        action: "send", clientId, invoiceId: inv.id, priceId: priceId.trim(),
        dueDate: inv.due_date,
      });
      toast.success("Invoice sent");
      if (r.checkoutUrl) {
        try { await navigator.clipboard.writeText(r.checkoutUrl); } catch { /* ignore */ }
      }
      setSendDialog(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
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
    <div style={{
      background: "hsl(40 20% 97% / 0.03)",
      border: "1px solid var(--crm-border-dark)",
      borderRadius: 12, padding: "22px 24px", marginTop: 24,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-accent)", marginBottom: 4, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <DollarSign size={12} /> Payment Schedule
          </div>
          <h3 style={{ fontFamily: "var(--crm-font-serif)", fontWeight: 300, fontSize: 22, color: "var(--crm-warm-white)", margin: 0 }}>
            Invoices {invoices.length > 0 && <span style={{ color: "var(--crm-taupe)", fontSize: 16 }}>· {fmtUSD(paid)} of {fmtUSD(total)} paid</span>}
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
        <div style={{ color: "var(--crm-taupe)", fontSize: 14, padding: "16px 0" }}>
          No payment schedule yet. Set up milestones to invoice the client through SureCart.
        </div>
      )}

      {!loading && !editing && invoices.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {invoices.map(inv => {
            const sc = statusColor(inv.status);
            return (
              <div key={inv.id} style={{
                display: "grid", gridTemplateColumns: "auto 1fr auto auto auto", gap: 12, alignItems: "center",
                padding: "12px 14px", border: "1px solid var(--crm-border-dark)", borderRadius: 8,
              }}>
                <div style={{ fontFamily: "var(--crm-font-serif)", fontSize: 18, color: "var(--crm-taupe)", width: 28, textAlign: "center" }}>
                  {inv.sequence}
                </div>
                <div>
                  <div style={{ color: "var(--crm-warm-white)", fontSize: 15 }}>{inv.label}</div>
                  <div style={{ fontSize: 12, color: "var(--crm-taupe)" }}>
                    {inv.due_date ? `Due ${new Date(inv.due_date).toLocaleDateString()}` : "No due date"}
                    {inv.paid_at && ` · Paid ${new Date(inv.paid_at).toLocaleDateString()}`}
                    {inv.sent_at && !inv.paid_at && ` · Sent ${new Date(inv.sent_at).toLocaleDateString()}`}
                  </div>
                </div>
                <div style={{ color: "var(--crm-warm-white)", fontSize: 16, fontVariantNumeric: "tabular-nums" }}>
                  {fmtUSD(inv.amount_cents)}
                </div>
                <span style={{
                  fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase",
                  padding: "3px 9px", borderRadius: 999, background: sc.bg, color: sc.fg,
                }}>{inv.status}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {(inv.status === "scheduled" || inv.status === "failed") && (
                    <>
                      <button className="crm-btn crm-btn--primary crm-btn--sm" disabled={busy === inv.id}
                        onClick={() => setSendDialog({ inv, priceId: "" })} title="Send via SureCart">
                        <Send size={12} /> Send
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
                          onClick={() => { window.open(inv.checkout_url!, "_blank", "noopener"); }}>
                          <ExternalLink size={12} /> Pay link
                        </button>
                      )}
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
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "60px 1fr 140px 160px auto", gap: 8, alignItems: "center",
                }}>
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

      {sendDialog && (
        <div onClick={() => setSendDialog(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "hsl(36 5% 16%)", border: "1px solid hsl(40 20% 97% / 0.08)",
            padding: 24, maxWidth: 460, width: "100%", color: "hsl(40 20% 97%)",
          }}>
            <h3 style={{ fontFamily: "var(--crm-font-serif)", fontSize: 22, fontStyle: "italic", margin: 0, marginBottom: 8 }}>
              Send "{sendDialog.inv.label}"
            </h3>
            <p style={{ color: "var(--crm-taupe)", fontSize: 13, marginBottom: 16 }}>
              Paste the SureCart <strong>Price ID</strong> for this milestone amount ({fmtUSD(sendDialog.inv.amount_cents)}).
              Create the price in SureCart first if you don't have one. SureCart will email the client a hosted invoice.
            </p>
            <label className="crm-label">SureCart Price ID</label>
            <input className="crm-input" placeholder="price_xxx" value={sendDialog.priceId}
              onChange={e => setSendDialog(d => d ? { ...d, priceId: e.target.value } : null)}
              autoFocus />
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button className="crm-btn crm-btn--ghost" onClick={() => setSendDialog(null)} disabled={busy === sendDialog.inv.id}>Cancel</button>
              <button className="crm-btn crm-btn--primary" disabled={busy === sendDialog.inv.id}
                onClick={() => sendInvoice(sendDialog.inv, sendDialog.priceId)}>
                {busy === sendDialog.inv.id ? "Sending…" : "Send invoice"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
