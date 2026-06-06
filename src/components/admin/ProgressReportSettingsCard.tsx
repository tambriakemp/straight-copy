import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

type Contact = { id: string; name: string | null; email: string | null; role: string | null; is_primary: boolean };

export default function ProgressReportSettingsCard({
  clientId,
  clientProjectId,
}: {
  clientId: string;
  clientProjectId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [recipientIds, setRecipientIds] = useState<string[]>([]);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [primaryContactId, setPrimaryContactId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<{
    subject?: string; html?: string; recipients?: string[]; period?: string; taskCount?: number; skipped?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: proj }, { data: cs }] = await Promise.all([
        supabase
          .from("client_projects")
          .select("progress_report_enabled, progress_report_recipient_ids, progress_report_last_sent_at, primary_contact_id")
          .eq("id", clientProjectId)
          .maybeSingle(),
        supabase
          .from("client_contacts")
          .select("id, name, email, role, is_primary")
          .eq("client_id", clientId)
          .order("is_primary", { ascending: false })
          .order("order_index"),
      ]);
      if (cancelled) return;
      const p = proj as any;
      setEnabled(p?.progress_report_enabled ?? true);
      setLastSentAt(p?.progress_report_last_sent_at ?? null);
      setPrimaryContactId(p?.primary_contact_id ?? null);
      setContacts((cs as Contact[]) ?? []);
      // default recipient: primary contact if list is empty
      const existing = (p?.progress_report_recipient_ids as string[] | null) ?? [];
      if (existing.length > 0) {
        setRecipientIds(existing);
      } else {
        const fallback =
          p?.primary_contact_id ??
          (cs as Contact[] | null)?.find((c) => c.is_primary)?.id ??
          null;
        setRecipientIds(fallback ? [fallback] : []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clientId, clientProjectId]);

  const toggleRecipient = (id: string) => {
    setRecipientIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("client_projects")
      .update({
        progress_report_enabled: enabled,
        progress_report_recipient_ids: recipientIds,
      } as never)
      .eq("id", clientProjectId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Progress report settings saved.");
  };

  const sendNow = async () => {
    setSending(true);
    const { data, error } = await supabase.functions.invoke("generate-progress-report", {
      body: { projectId: clientProjectId, forceSend: true },
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    const res = data as { ok?: boolean; skipped?: string; recipients?: string[]; error?: string } | null;
    if (res?.skipped === "no_tasks_completed") {
      toast.message("No tasks were completed this week — nothing to send.");
    } else if (res?.ok) {
      toast.success(`Report sent to ${res.recipients?.length ?? 0} recipient(s).`);
      // refresh last_sent_at
      const { data: p } = await supabase
        .from("client_projects")
        .select("progress_report_last_sent_at")
        .eq("id", clientProjectId)
        .maybeSingle();
      setLastSentAt((p as any)?.progress_report_last_sent_at ?? null);
    } else {
      toast.error(res?.error || "Failed to send report.");
    }
  };

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={{ color: "var(--crm-taupe)", fontSize: 14 }}>Loading progress report settings…</div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18 }}>
        <div>
          <div style={eyebrowStyle}>Weekly Progress Report</div>
          <h3 style={titleStyle}>AI Friday Summary</h3>
          <p style={{ color: "var(--crm-taupe)", fontSize: 14, maxWidth: 560, margin: "8px 0 0" }}>
            Every Friday at 5pm ET, an AI-generated summary of completed tasks is emailed to selected contacts.
            If no tasks were completed that week, no report is sent. You always receive a copy.
          </p>
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--crm-warm-white)", fontSize: 14, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: 16, height: 16 }}
          />
          Enabled
        </label>
      </div>

      <div style={{ borderTop: "1px solid var(--crm-border-dark)", paddingTop: 18 }}>
        <div style={{ ...eyebrowStyle, marginBottom: 10 }}>Recipients</div>
        {contacts.length === 0 ? (
          <div style={{ color: "var(--crm-taupe)", fontSize: 14 }}>
            No contacts on this client yet. Add contacts on the client page.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {contacts.map((c) => {
              const isPrimary = c.id === primaryContactId || (c.is_primary && !primaryContactId);
              return (
                <label
                  key={c.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px",
                    border: "1px solid var(--crm-border-dark)",
                    borderRadius: 8,
                    cursor: c.email ? "pointer" : "not-allowed",
                    opacity: c.email ? 1 : 0.5,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={recipientIds.includes(c.id)}
                    onChange={() => toggleRecipient(c.id)}
                    disabled={!c.email}
                    style={{ width: 16, height: 16 }}
                  />
                  <div style={{ flex: 1, color: "var(--crm-warm-white)", fontSize: 14 }}>
                    <div>
                      {c.name || "(unnamed)"}{" "}
                      <span style={{ color: "var(--crm-taupe)" }}>· {c.email || "no email"}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--crm-taupe)", marginTop: 2 }}>
                      {c.role || "—"}
                      {isPrimary && (
                        <span style={{ marginLeft: 8, textTransform: "uppercase", letterSpacing: "0.2em", color: "var(--crm-accent)" }}>
                          Primary
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--crm-taupe)" }}>
          Admin (Tambria) is always copied on every report.
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22, gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 12, color: "var(--crm-taupe)" }}>
          {lastSentAt
            ? `Last sent ${format(new Date(lastSentAt), "MMM d, yyyy · h:mm a")}`
            : "Never sent."}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={sendNow}
            disabled={sending}
            style={btnGhost}
          >
            {sending ? "Sending…" : "Send report now"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={btnPrimary}
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--crm-border-dark)",
  borderRadius: 12,
  padding: 24,
  background: "hsl(40 20% 97% / 0.02)",
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.3em",
  textTransform: "uppercase",
  color: "var(--crm-accent)",
};

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--crm-font-serif)",
  fontSize: 24,
  color: "var(--crm-warm-white)",
  margin: "6px 0 0",
};

const btnPrimary: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--crm-accent)",
  color: "var(--crm-warm-white)",
  padding: "10px 18px",
  fontSize: 13,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  cursor: "pointer",
  borderRadius: 4,
};

const btnGhost: React.CSSProperties = {
  ...btnPrimary,
  borderColor: "var(--crm-border-dark)",
  color: "var(--crm-taupe)",
};
