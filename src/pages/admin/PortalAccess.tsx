// CRE-536: first-time password setup for existing clients, admin-side.
//
// A roster of every active client and whether they can sign in to their
// portal yet — not invited, invited (link sent, not used), active
// (password set). The invite only ever fires on a click here or on the
// client's own detail page; the bulk button below sends nothing by
// itself either, it only shows a confirm step first.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Send } from "lucide-react";
import { toast } from "sonner";

type PortalStatus = "not_invited" | "invited" | "active";

interface PortalRow {
  client_id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  portal_status: PortalStatus;
  invited_at: string | null;
  activated_at: string | null;
}

function statusOf(status: PortalStatus): { label: string; tone: string } {
  if (status === "active") return { label: "Active", tone: "hsl(150 35% 70%)" };
  if (status === "invited") return { label: "Invited", tone: "hsl(30 25% 44%)" };
  return { label: "Not invited", tone: "hsl(30 8% 62%)" };
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

export default function PortalAccess() {
  const [rows, setRows] = useState<PortalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("portal-invite", { body: { action: "status" } });
      if (error) throw new Error(error.message);
      setRows((data?.clients ?? []) as PortalRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load portal access");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const notInvitedCount = useMemo(
    () => rows.filter((r) => r.portal_status === "not_invited" && r.contact_email).length,
    [rows],
  );

  const inviteOne = async (row: PortalRow) => {
    if (!row.contact_email) {
      toast.error("Add a contact email for this client first");
      return;
    }
    setBusyId(row.client_id);
    const t = toast.loading(row.portal_status === "not_invited" ? "Sending invite…" : "Resending…");
    try {
      const { data, error } = await supabase.functions.invoke("portal-invite", {
        body: { action: "invite", clientId: row.client_id, email: row.contact_email },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(`Invite sent to ${row.contact_email}`, { id: t });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the invite", { id: t });
    } finally {
      setBusyId(null);
    }
  };

  const bulkInvite = async () => {
    setBulkBusy(true);
    const t = toast.loading("Sending invites…");
    try {
      const { data, error } = await supabase.functions.invoke("portal-invite", {
        body: { action: "bulk_invite" },
      });
      if (error) throw new Error(error.message);
      toast.success(`Invited ${data?.invited ?? 0} client${data?.invited === 1 ? "" : "s"} (${data?.skipped ?? 0} skipped)`, { id: t });
      setBulkOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk invite failed", { id: t });
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <AdminLayout dark>
      <div className="roster">
        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">Client portal</div>
            <h1 className="roster__title">Portal <em>access</em></h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              Every existing client's sign-in status for the client portal. Nothing is sent to
              anyone until you click Invite.
            </p>
          </div>
          <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <button
              type="button"
              className="crm-btn crm-btn--primary"
              onClick={() => setBulkOpen(true)}
              disabled={loading || notInvitedCount === 0}
            >
              <Send className="h-4 w-4" /> Invite all ({notInvitedCount})
            </button>
            <DialogContent className="crm-shell !bg-[hsl(36_5%_16%)] !border-[hsl(40_20%_97%/0.08)] !text-[hsl(40_20%_97%)] !rounded-none !max-w-md">
              <DialogHeader>
                <DialogTitle className="font-serif italic text-2xl text-[hsl(40_20%_97%)]">
                  Invite {notInvitedCount} client{notInvitedCount === 1 ? "" : "s"}?
                </DialogTitle>
                <DialogDescription className="text-[hsl(30_8%_62%)]">
                  Each one with a contact email on file and no portal invite yet gets an email
                  with a one-time link to set their portal password. Clients with no email on
                  file are skipped.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="mt-2">
                <button className="crm-btn crm-btn--bronze" onClick={bulkInvite} disabled={bulkBusy}>
                  {bulkBusy ? "Sending…" : "Send invites"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <p className="text-[hsl(30_8%_62%)] text-sm">Loading…</p>
        ) : !rows.length ? (
          <div className="crm-empty">
            <div className="crm-empty__glyph">∅</div>
            <div className="crm-empty__title">No <em>clients</em> yet.</div>
          </div>
        ) : (
          <>
            <div className="roster__head-row" style={{ gridTemplateColumns: "2fr 1.6fr 1fr 0.9fr 0.9fr 1fr" }}>
              <div className="roster__col-h" style={{ cursor: "default" }}>Client</div>
              <div className="roster__col-h" style={{ cursor: "default" }}>Contact email</div>
              <div className="roster__col-h" style={{ cursor: "default" }}>Status</div>
              <div className="roster__col-h" style={{ cursor: "default" }}>Invited</div>
              <div className="roster__col-h" style={{ cursor: "default" }}>Active since</div>
              <div className="roster__col-h" style={{ cursor: "default", justifyContent: "flex-end" }}>Actions</div>
            </div>
            <div className="roster__list">
              {rows.map((row) => {
                const s = statusOf(row.portal_status);
                return (
                  <div
                    key={row.client_id}
                    className="roster__row"
                    style={{ gridTemplateColumns: "2fr 1.6fr 1fr 0.9fr 0.9fr 1fr", cursor: "default" }}
                  >
                    <div className="roster__client">
                      <div className="roster__name" style={{ fontSize: 22 }}>
                        {row.business_name || row.contact_name || "—"}
                      </div>
                      <div className="roster__email">{row.contact_name || ""}</div>
                    </div>
                    <div className="roster__next" style={{ fontSize: 17 }}>{row.contact_email || "—"}</div>
                    <div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 16, letterSpacing: "0.2em", textTransform: "uppercase", color: s.tone }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: s.tone }} />
                        {s.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 17, letterSpacing: "0.15em", color: "hsl(30 8% 62%)", textTransform: "uppercase" }}>
                      {fmtDate(row.invited_at)}
                    </div>
                    <div style={{ fontSize: 17, letterSpacing: "0.15em", color: "hsl(30 8% 62%)", textTransform: "uppercase" }}>
                      {fmtDate(row.activated_at)}
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                      <Link to={`/admin/clients/${row.client_id}`}>
                        <button className="crm-btn crm-btn--ghost crm-btn--sm">View</button>
                      </Link>
                      {row.portal_status !== "active" && (
                        <button
                          className="crm-btn crm-btn--ghost crm-btn--sm"
                          onClick={() => inviteOne(row)}
                          disabled={busyId === row.client_id || !row.contact_email}
                          title={row.contact_email ? undefined : "No contact email on file"}
                        >
                          {row.portal_status === "not_invited" ? "Invite" : "Resend"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
