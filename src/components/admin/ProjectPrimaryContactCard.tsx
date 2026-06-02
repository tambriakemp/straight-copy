import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Contact = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
};

export default function ProjectPrimaryContactCard({
  clientId,
  clientProjectId,
}: {
  clientId: string;
  clientProjectId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: cs }, { data: proj }] = await Promise.all([
          supabase
            .from("client_contacts")
            .select("id, name, email, phone, role, is_primary")
            .eq("client_id", clientId)
            .order("order_index", { ascending: true }),
          supabase
            .from("client_projects")
            .select("primary_contact_id")
            .eq("id", clientProjectId)
            .maybeSingle(),
        ]);
        if (cancelled) return;
        setContacts((cs ?? []) as Contact[]);
        setSelectedId((proj?.primary_contact_id as string | null) ?? "");
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load contacts");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, clientProjectId]);

  const save = async (next: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("client_projects")
        .update({ primary_contact_id: next || null })
        .eq("id", clientProjectId);
      if (error) throw error;
      setSelectedId(next);
      toast.success(next ? "Primary contact assigned to this project" : "Primary contact cleared");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const selected = contacts.find((c) => c.id === selectedId) ?? null;

  return (
    <div
      style={{
        border: "1px solid var(--crm-border-dark)",
        borderRadius: 12,
        padding: 22,
        background: "hsl(40 20% 97% / 0.025)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-accent)" }}>
            Project Primary Contact
          </div>
          <h3 style={{ fontFamily: "var(--crm-font-serif)", color: "var(--crm-warm-white)", margin: "6px 0 0", fontSize: 22 }}>
            Who is this <em>project</em> for?
          </h3>
        </div>
      </div>

      <p style={{ color: "var(--crm-taupe)", fontSize: 14, marginTop: 10, maxWidth: 640 }}>
        Choose which contact from this client's contact list is the primary contact for this project.
        The contract and all outbound project emails will default to this person.
        Leave unset to fall back to the client's default primary contact.
      </p>

      {loading ? (
        <div style={{ color: "var(--crm-taupe)", marginTop: 16 }}>Loading contacts…</div>
      ) : contacts.length === 0 ? (
        <div style={{ color: "var(--crm-taupe)", marginTop: 16, fontStyle: "italic" }}>
          No contacts found. Add contacts on the client profile first.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 18 }}>
          <select
            value={selectedId}
            disabled={saving}
            onChange={(e) => void save(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--crm-border-dark)",
              background: "hsl(35 15% 8%)",
              color: "var(--crm-warm-white)",
              fontSize: 15,
              maxWidth: 480,
            }}
          >
            <option value="">— Use client default contact —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.name || c.email || "Unnamed contact") +
                  (c.role ? ` · ${c.role}` : "") +
                  (c.is_primary ? "  (client default)" : "")}
              </option>
            ))}
          </select>

          {selected && (
            <div style={{ color: "var(--crm-warm-white)", fontSize: 14, lineHeight: 1.6 }}>
              <div><strong>{selected.name || "Unnamed"}</strong>{selected.role ? ` — ${selected.role}` : ""}</div>
              <div style={{ color: "var(--crm-taupe)" }}>
                {selected.email || "no email"}{selected.phone ? ` · ${selected.phone}` : ""}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
