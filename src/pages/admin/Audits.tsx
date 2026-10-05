import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";

// client_audits isn't in the generated Database type yet — see the same note
// in Briefs.tsx.
const db = supabase as unknown as { from: (table: string) => any };

interface ClientAudit {
  id: string; client_name: string; slug: string; password: string;
  report_url: string | null; status: string; password_rotated_at: string;
}

const WORDS = ["copper", "harbor", "willow", "cedar", "quartz", "amber", "maple", "ridge", "violet", "basin", "linen", "clover"];
function randomPassword() {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  const digits = Math.floor(10 + Math.random() * 89);
  return `${pick()}-${pick()}-${digits}`;
}

export default function Audits() {
  const [rows, setRows] = useState<ClientAudit[] | null>(null);
  const [revealedId, setRevealedId] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await db.from("client_audits").select("*").order("client_name");
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as ClientAudit[]);
  };
  useEffect(() => { load(); }, []);

  const rotate = async (row: ClientAudit) => {
    if (!confirm(`Rotate the audit password for ${row.client_name}? The old password stops working immediately.`)) return;
    const next = randomPassword();
    const { error } = await db.from("client_audits")
      .update({ password: next, password_rotated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${row.client_name}'s password rotated`);
    setRevealedId(row.id);
    load();
  };

  const copy = (value: string) => { navigator.clipboard.writeText(value); toast.success("Copied"); };

  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">Client work</div>
            <h1 className="roster__title">Audit <em>passwords</em></h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              Every client's audit-report password. See it, copy it, reset it — nothing else needs to.
            </p>
          </div>
        </div>

        {!rows ? (
          <div style={{ fontSize: 16, color: "hsl(30 8% 62%)" }}>Loading…</div>
        ) : !rows.length ? (
          <div className="crm-empty">
            <div className="crm-empty__glyph">∅</div>
            <div className="crm-empty__title">No <em>clients</em> yet.</div>
            <div className="crm-empty__sub">Rows land here as audit reports go out.</div>
          </div>
        ) : (
          <>
            <div className="roster__head-row" style={{ gridTemplateColumns: "2fr 1fr 2fr 1.4fr" }}>
              <div className="roster__col-h" style={{ cursor: "default" }}>Client</div>
              <div className="roster__col-h" style={{ cursor: "default" }}>Status</div>
              <div className="roster__col-h" style={{ cursor: "default" }}>Password</div>
              <div className="roster__col-h" style={{ cursor: "default", justifyContent: "flex-end" }}>Actions</div>
            </div>
            <div className="roster__list">
              {rows.map((row) => (
                <div key={row.id} className="roster__row" style={{ gridTemplateColumns: "2fr 1fr 2fr 1.4fr", cursor: "default" }}>
                  <div className="roster__name" style={{ fontSize: 22 }}>
                    {row.report_url ? <a href={row.report_url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{row.client_name}</a> : row.client_name}
                  </div>
                  <div style={{ fontSize: 16, textTransform: "uppercase", letterSpacing: "0.15em", color: "hsl(30 8% 62%)" }}>{row.status}</div>
                  <code style={{
                    fontFamily: "monospace", fontSize: 16, color: "hsl(40 20% 97%)",
                    background: "hsl(40 8% 10%)", padding: "6px 10px", border: "1px solid hsl(40 20% 97% / 0.08)",
                  }}>
                    {revealedId === row.id ? row.password : "•".repeat(row.password.length)}
                  </code>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                    <button className="crm-btn crm-btn--ghost crm-btn--sm"
                      onClick={() => setRevealedId(revealedId === row.id ? null : row.id)}>
                      {revealedId === row.id ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                    <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => copy(row.password)}>
                      <Copy className="h-3 w-3" />
                    </button>
                    <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={() => rotate(row)}>
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
