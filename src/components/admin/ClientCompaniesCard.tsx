// The businesses a client runs.
//
// Bree: "A client can have more than one company/business. Khadra Kahin has 3
// different businesses that I am working on for her."
//
// This is a LIST, not a form. It used to render four inputs per company, all
// the time, so three companies meant twelve fields sitting open in a sidebar
// nobody was editing. Now a company is one row; adding or editing one opens a
// side panel, which keeps the list still while you type and makes "I am
// editing this one" a state you can see and leave.
//
// The primary company still feeds `clients.business_name` through a database
// trigger, because sixty-odd files and twenty edge functions still read it.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import SidePanel from "@/components/admin/SidePanel";

export type Company = {
  id: string;
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  is_primary: boolean;
  order_index: number;
};

type Draft = {
  id: string | null;
  name: string;
  email: string;
  phone: string;
  website: string;
  is_primary: boolean;
};

const blankDraft = (isFirst: boolean): Draft => ({
  id: null, name: "", email: "", phone: "", website: "", is_primary: isFirst,
});

const toDraft = (c: Company): Draft => ({
  id: c.id,
  name: c.name ?? "",
  email: c.email ?? "",
  phone: c.phone ?? "",
  website: c.website ?? "",
  is_primary: c.is_primary,
});

export default function ClientCompaniesCard({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("client_companies")
      .select("id, client_id, name, email, phone, website, is_primary, order_index")
      .eq("client_id", clientId)
      .eq("archived", false)
      .order("is_primary", { ascending: false })
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data ?? []) as Company[]);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const patch = (field: keyof Draft, value: string | boolean) =>
    setDraft((d) => (d ? { ...d, [field]: value } : d));

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return toast.error("A company needs a name.");
    setSaving(true);
    try {
      // Exactly one primary per client is a partial unique index, so the old
      // one has to be cleared before the new one is written — otherwise the
      // insert is rejected and the save half-applies.
      if (draft.is_primary) {
        const { error } = await supabase.from("client_companies")
          .update({ is_primary: false }).eq("client_id", clientId);
        if (error) throw error;
      }
      const payload = {
        client_id: clientId,
        name,
        email: draft.email.trim() || null,
        phone: draft.phone.trim() || null,
        website: draft.website.trim() || null,
        is_primary: draft.is_primary,
        order_index: draft.id
          ? rows.find((r) => r.id === draft.id)?.order_index ?? rows.length
          : rows.length,
      };
      const { error } = draft.id
        ? await supabase.from("client_companies").update(payload).eq("id", draft.id)
        : await supabase.from("client_companies").insert(payload);
      if (error) throw error;
      toast.success(draft.id ? "Company updated" : "Company added");
      setDraft(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!draft?.id) return;
    if (draft.is_primary && rows.length > 1) {
      return toast.error("Make another company primary first.");
    }
    setSaving(true);
    const { error } = await supabase.from("client_companies").delete().eq("id", draft.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Company removed");
    setDraft(null);
    await load();
  };

  return (
    <section className="cmp">
      <div className="cmp__head">
        <div className="cmp__eyebrow">
          <Building2 size={13} /> Companies
        </div>
        {/* Icon only — the heading beside it already says what gets added. */}
        <button
          type="button"
          className="cmp__add"
          onClick={() => setDraft(blankDraft(rows.length === 0))}
          title="Add a company"
          aria-label="Add a company"
        >
          <Plus size={14} />
        </button>
      </div>

      {loading ? (
        <p className="cmp__empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="cmp__empty">No companies yet.</p>
      ) : (
        <ul className="cmp__list">
          {rows.map((c) => (
            <li key={c.id} className="cmp__row">
              <button
                type="button"
                className="cmp__row-main"
                onClick={() => setDraft(toDraft(c))}
                title="Edit this company"
              >
                <span className="cmp__name">
                  {c.name}
                  {c.is_primary && (
                    <Star size={11} className="cmp__star" aria-label="Primary company" />
                  )}
                </span>
                {(c.email || c.phone) && (
                  <span className="cmp__meta">{c.email || c.phone}</span>
                )}
              </button>
              <Pencil size={12} className="cmp__pencil" aria-hidden />
            </li>
          ))}
        </ul>
      )}

      <SidePanel
        open={!!draft}
        title={draft?.id ? "Edit company" : "Add company"}
        subtitle={draft?.id ? undefined : "A client can run more than one business."}
        onClose={() => setDraft(null)}
        footer={
          <>
            {draft?.id && (
              <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => void remove()} disabled={saving}>
                <Trash2 size={12} /> Remove
              </button>
            )}
            <button className="crm-btn crm-btn--ghost" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </button>
            <button className="crm-btn crm-btn--primary" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : draft?.id ? "Save changes" : "Add company"}
            </button>
          </>
        }
      >
        {draft && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="crm-label">Company name *</label>
              <input className="crm-input" value={draft.name} autoFocus
                onChange={(e) => patch("name", e.target.value)} placeholder="Menovia" />
            </div>
            <div>
              <label className="crm-label">Company email</label>
              <input className="crm-input" type="email" value={draft.email}
                onChange={(e) => patch("email", e.target.value)} placeholder="hello@menovia.com" />
            </div>
            <div>
              <label className="crm-label">Company phone</label>
              <input className="crm-input" value={draft.phone}
                onChange={(e) => patch("phone", e.target.value)} placeholder="(555) 555-5555" />
            </div>
            <div>
              <label className="crm-label">Website</label>
              <input className="crm-input" value={draft.website}
                onChange={(e) => patch("website", e.target.value)} placeholder="menovia.com" />
            </div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 16, color: "var(--crm-stone)" }}>
              <input type="checkbox" checked={draft.is_primary} style={{ marginTop: 4 }}
                onChange={(e) => patch("is_primary", e.target.checked)} />
              <span>
                Primary company
                <span style={{ display: "block", fontSize: 14, color: "var(--crm-taupe)" }}>
                  Its name shows wherever a single business name is still displayed.
                </span>
              </span>
            </label>
          </div>
        )}
      </SidePanel>
    </section>
  );
}
