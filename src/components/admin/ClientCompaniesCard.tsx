// The businesses a client runs.
//
// Bree: "A client can have more than one company/business. Khadra Kahin has 3
// different businesses that I am working on for her and any of these business
// can have different type of projects."
//
// This replaces the single `Business name` field on the client. That field
// could only hold one name, so a client with three businesses had to pick one,
// and everything underneath inherited it — which is how a proposal for Aviya
// Telemed ended up filed under Menovia.
//
// The primary company still feeds `clients.business_name` through a database
// trigger, because sixty-odd files and twenty edge functions still read it.
// Renaming the primary company here changes that too, everywhere, at once.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Plus, Star, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

/** Blank row, so an unsaved company looks the same as a saved one. */
type Draft = {
  _key: string;
  id: string | null;
  name: string;
  email: string;
  phone: string;
  website: string;
  is_primary: boolean;
};

const blank = (isFirst: boolean): Draft => ({
  _key: `new-${Math.random().toString(36).slice(2)}`,
  id: null, name: "", email: "", phone: "", website: "", is_primary: isFirst,
});

export default function ClientCompaniesCard({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removed, setRemoved] = useState<string[]>([]);

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
    setRows(((data ?? []) as Company[]).map((c) => ({
      _key: c.id,
      id: c.id,
      name: c.name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      website: c.website ?? "",
      is_primary: c.is_primary,
    })));
    setRemoved([]);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const patch = (key: string, field: keyof Draft, value: string | boolean) =>
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, [field]: value } : r)));

  // Exactly one primary, enforced in the database by a partial unique index —
  // so the UI has to unset the old one in the same gesture rather than letting
  // the save fail.
  const makePrimary = (key: string) =>
    setRows((rs) => rs.map((r) => ({ ...r, is_primary: r._key === key })));

  const add = () => setRows((rs) => [...rs, blank(rs.length === 0)]);

  const remove = (key: string) => {
    const row = rows.find((r) => r._key === key);
    if (row?.is_primary && rows.length > 1) {
      return toast.error("Make another company primary first.");
    }
    if (row?.id) setRemoved((x) => [...x, row.id!]);
    setRows((rs) => rs.filter((r) => r._key !== key));
  };

  const save = async () => {
    const named = rows.filter((r) => r.name.trim());
    if (rows.length && !named.length) return toast.error("A company needs a name.");
    if (named.length && !named.some((r) => r.is_primary)) {
      return toast.error("Mark one company as primary.");
    }
    setSaving(true);
    try {
      if (removed.length) {
        const { error } = await supabase.from("client_companies").delete().in("id", removed);
        if (error) throw error;
      }

      // Clear every primary flag before setting the new one. The unique index
      // is on (client_id) WHERE is_primary, so writing the new primary while
      // the old one still holds the flag is rejected — and would leave the save
      // half-applied.
      if (named.length) {
        const { error } = await supabase.from("client_companies")
          .update({ is_primary: false }).eq("client_id", clientId);
        if (error) throw error;
      }

      for (const [i, r] of named.entries()) {
        const payload = {
          client_id: clientId,
          name: r.name.trim(),
          email: r.email.trim() || null,
          phone: r.phone.trim() || null,
          website: r.website.trim() || null,
          is_primary: r.is_primary,
          order_index: i,
        };
        const { error } = r.id
          ? await supabase.from("client_companies").update(payload).eq("id", r.id)
          : await supabase.from("client_companies").insert(payload);
        if (error) throw error;
      }
      toast.success("Companies saved");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{
      border: "1px solid var(--crm-border-dark)", borderRadius: 12,
      padding: "22px 24px", marginTop: 16,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 16, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-accent)" }}>
          <Building2 size={13} /> Companies
        </div>
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--sm" onClick={add}>
          <Plus size={12} /> Add company
        </button>
      </div>
      <p style={{ fontSize: 15, color: "var(--crm-taupe)", margin: "0 0 14px" }}>
        The businesses this client runs. Each project belongs to one of them, and
        the primary company's name is what shows wherever a single business name
        is still displayed.
      </p>

      {loading ? (
        <p style={{ color: "var(--crm-taupe)", fontSize: 15 }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--crm-taupe)", fontSize: 15, fontStyle: "italic" }}>
          No companies yet. Click "Add company" above.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => (
            <div key={r._key} style={{
              border: r.is_primary ? "1px solid hsl(40 30% 60% / 0.5)" : "1px solid var(--crm-border-dark)",
              borderRadius: 4, padding: 12,
              background: r.is_primary ? "hsl(40 20% 97% / 0.03)" : "transparent",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <button
                  type="button"
                  className="crm-btn crm-btn--ghost crm-btn--sm"
                  onClick={() => makePrimary(r._key)}
                  title={r.is_primary ? "This is the primary company" : "Make this the primary company"}
                  style={{ color: r.is_primary ? "var(--crm-accent)" : undefined }}
                >
                  <Star size={12} /> {r.is_primary ? "Primary" : "Make primary"}
                </button>
                <button
                  type="button"
                  className="crm-btn crm-btn--ghost crm-btn--sm"
                  onClick={() => remove(r._key)}
                  title="Remove this company"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 }}>
                <div>
                  <label className="crm-label">Company name</label>
                  <input className="crm-input" value={r.name}
                    onChange={(e) => patch(r._key, "name", e.target.value)}
                    placeholder="Menovia" />
                </div>
                <div>
                  <label className="crm-label">Company email</label>
                  <input className="crm-input" type="email" value={r.email}
                    onChange={(e) => patch(r._key, "email", e.target.value)}
                    placeholder="hello@menovia.com" />
                </div>
                <div>
                  <label className="crm-label">Company phone</label>
                  <input className="crm-input" value={r.phone}
                    onChange={(e) => patch(r._key, "phone", e.target.value)}
                    placeholder="(555) 555-5555" />
                </div>
                <div>
                  <label className="crm-label">Website</label>
                  <input className="crm-input" value={r.website}
                    onChange={(e) => patch(r._key, "website", e.target.value)}
                    placeholder="menovia.com" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="crm-btn crm-btn--primary crm-btn--sm" onClick={() => void save()} disabled={saving || loading}>
          {saving ? "Saving…" : "Save companies"}
        </button>
      </div>
    </section>
  );
}
