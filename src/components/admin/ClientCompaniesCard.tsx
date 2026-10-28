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
//
// CRE-803: Paperclip is the source of truth for client_companies as of the
// CP-6 cutover, so the add/edit/remove side panel below is gone — this is a
// list now, nothing more. The panel and its three calls (the primary-clear
// update, the upsert, the delete) are kept as a comment rather than deleted,
// since reviving this means reviving exactly this shape, partial-unique-index
// handling included:
//
//   if (draft.is_primary) {
//     await supabase.from("client_companies").update({ is_primary: false }).eq("client_id", clientId);
//   }
//   const { error } = draft.id
//     ? await supabase.from("client_companies").update(payload).eq("id", draft.id)
//     : await supabase.from("client_companies").insert(payload);
//   // remove: await supabase.from("client_companies").delete().eq("id", draft.id);
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ReadOnlyNotice } from "@/components/admin/ReadOnlyNotice";

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

export default function ClientCompaniesCard({ clientId }: { clientId: string }) {
  const [rows, setRows] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <section className="cmp">
      <div className="cmp__head">
        <div className="cmp__eyebrow">
          <Building2 size={13} /> Companies
        </div>
      </div>

      {loading ? (
        <p className="cmp__empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="cmp__empty">No companies yet.</p>
      ) : (
        <ul className="cmp__list">
          {rows.map((c) => (
            <li key={c.id} className="cmp__row">
              <span className="cmp__row-main">
                <span className="cmp__name">
                  {c.name}
                  {c.is_primary && (
                    <Star size={11} className="cmp__star" aria-label="Primary company" />
                  )}
                </span>
                {(c.email || c.phone) && (
                  <span className="cmp__meta">{c.email || c.phone}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <ReadOnlyNotice subject="company list" />
    </section>
  );
}
