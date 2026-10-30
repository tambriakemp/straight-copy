import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Copy, Check, Ban } from "lucide-react";
import { toast } from "sonner";

// CRE-822, G6: reads and writes through `onboarding-invites-admin`, which
// answers from the Client Portal plugin or the `/admin` table depending on
// this install -- this page used to query `onboarding_invites` directly.
// `token` is populated here only immediately after `create`: neither source
// hands a token back for an invite the browser did not just mint, so the
// list's own "Copy"/"Open" buttons from before this card are gone. See
// `_shared/onboarding-invite-source.ts`'s header for why that is not a bug
// to work around. The "View" link that used to point at `/admin/clients/
// ${submission_id}` is also gone -- `/admin/clients/:id` resolves a CLIENT
// id, and a submission id was never one; that link never worked.
type Invite = {
  id: string;
  contactName: string | null;
  contactEmail: string | null;
  businessName: string | null;
  note: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  lastOpenedAt: string | null;
  createdAt: string;
  revoked: boolean;
  expired: boolean;
  sourceOrderRef: string | null;
  tier: string | null;
};

function statusOf(inv: Invite): { label: string; tone: string } {
  if (inv.revoked) return { label: "Revoked", tone: "hsl(30 10% 78%)" };
  if (inv.completedAt) return { label: "Completed", tone: "hsl(150 35% 70%)" };
  if (inv.expired) return { label: "Expired", tone: "hsl(8 55% 70%)" };
  if (inv.lastOpenedAt) return { label: "Opened", tone: "hsl(30 10% 78%)" };
  return { label: "Not opened", tone: "hsl(30 8% 62%)" };
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

async function invokeAdmin<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("onboarding-invites-admin", {
    body: { action, ...body },
  });
  if (error) throw new Error((data as { error?: string } | null)?.error ?? error.message);
  return data as T;
}

export default function Invites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // The one link the browser ever holds, right after creating it -- see this
  // file's header.
  const [justCreated, setJustCreated] = useState<{ id: string; token: string } | null>(null);
  const [form, setForm] = useState({
    contact_name: "",
    contact_email: "",
    business_name: "",
    note: "",
    expiry: "30",
  });

  const baseUrl = useMemo(() => window.location.origin, []);

  const load = async () => {
    setLoading(true);
    try {
      const { invites: rows } = await invokeAdmin<{ invites: Invite[] }>("list");
      setInvites(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load invites");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const linkFor = (token: string) => `${baseUrl}/onboarding?invite=${token}`;

  const copyJustCreated = async () => {
    if (!justCreated) return;
    await navigator.clipboard.writeText(linkFor(justCreated.token));
    setCopiedId(justCreated.id);
    toast.success("Link copied");
    setTimeout(() => setCopiedId(null), 1500);
  };

  const create = async () => {
    if (!form.contact_name.trim() && !form.contact_email.trim()) {
      toast.error("Add at least a name or email");
      return;
    }
    try {
      const { invite } = await invokeAdmin<{ invite: Invite & { token: string } }>("create", {
        contactName: form.contact_name.trim() || null,
        contactEmail: form.contact_email.trim() || null,
        businessName: form.business_name.trim() || null,
        note: form.note.trim() || null,
        expiresInDays: Number(form.expiry),
      });
      setJustCreated({ id: invite.id, token: invite.token });
      const url = linkFor(invite.token);
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Invite created — link copied to clipboard");
      } catch {
        toast.success("Invite created");
      }
      setOpen(false);
      setForm({ contact_name: "", contact_email: "", business_name: "", note: "", expiry: "30" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create that invite");
    }
  };

  const revoke = async (inv: Invite) => {
    if (!confirm(`Revoke invite for ${inv.contactName || inv.contactEmail || "this prospect"}?`))
      return;
    try {
      await invokeAdmin("revoke", { id: inv.id });
      toast.success("Invite revoked");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revoke that invite");
    }
  };

  return (
    <AdminLayout dark>
      <div className="roster">
        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">Onboarding</div>
            <h1 className="roster__title">All <em>invites</em></h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              Generate personalized links so prospects can complete onboarding at their own pace.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button className="crm-btn crm-btn--primary">
                <Plus className="h-4 w-4" /> New Invite
              </button>
            </DialogTrigger>
            <DialogContent className="crm-shell !bg-[hsl(36_5%_16%)] !border-[hsl(40_20%_97%/0.08)] !text-[hsl(40_20%_97%)] !rounded-none !max-w-md">
              <DialogHeader>
                <DialogTitle className="font-serif italic text-2xl text-[hsl(40_20%_97%)]">Create invite link</DialogTitle>
                <DialogDescription className="text-[hsl(30_8%_62%)]">
                  The link will be copied to your clipboard. Send it via your own email or DM.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <label className="crm-label">Contact name</label>
                  <input
                    className="crm-input"
                    value={form.contact_name}
                    onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className="crm-label">Contact email</label>
                  <input
                    className="crm-input" type="email"
                    value={form.contact_email}
                    onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                    placeholder="jane@studio.com"
                  />
                </div>
                <div>
                  <label className="crm-label">Business name</label>
                  <input
                    className="crm-input"
                    value={form.business_name}
                    onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                    placeholder="Studio Name"
                  />
                </div>
                <div>
                  <label className="crm-label">Internal note</label>
                  <textarea
                    className="crm-input"
                    rows={2}
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    placeholder="Lead from Instagram DM…"
                  />
                </div>
                <div>
                  <label className="crm-label">Link expires</label>
                  <select
                    className="crm-input"
                    value={form.expiry}
                    onChange={(e) => setForm({ ...form, expiry: e.target.value })}
                  >
                    <option value="7">In 7 days</option>
                    <option value="30">In 30 days</option>
                    <option value="90">In 90 days</option>
                    {/* No "Never" -- the plugin caps every invite at 365
                        days, and the two sources drawing the same choice
                        differently is worse than this form just not
                        offering it. */}
                    <option value="365">In 365 days</option>
                  </select>
                </div>
              </div>
              <DialogFooter className="mt-2">
                <button className="crm-btn crm-btn--bronze" onClick={create}>
                  Create &amp; copy link
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {justCreated && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 16px",
              marginBottom: 16,
              border: "1px solid hsl(150 35% 40% / 0.4)",
              background: "hsl(150 35% 40% / 0.08)",
            }}
          >
            <span style={{ fontSize: 16 }}>Link ready for the invite you just created.</span>
            <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={copyJustCreated}>
              {copiedId === justCreated.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {" "}Copy link again
            </button>
          </div>
        )}

        {loading ? (
          <p className="text-[hsl(30_8%_62%)] text-sm">Loading invites…</p>
        ) : invites.length === 0 ? (
          <div className="crm-empty">
            <div className="crm-empty__glyph">∅</div>
            <div className="crm-empty__title">No <em>invites</em> yet.</div>
            <div className="crm-empty__sub">Create your first invite link to get started.</div>
            <button className="crm-btn crm-btn--bronze" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Create invite
            </button>
          </div>
        ) : (
          <>
            <div className="roster__head-row" style={{ gridTemplateColumns: "2fr 1.4fr 1fr 0.9fr 0.9fr 0.6fr" }}>
              <div className="roster__col-h" style={{ cursor: "default" }}>Contact</div>
              <div className="roster__col-h" style={{ cursor: "default" }}>Business</div>
              <div className="roster__col-h" style={{ cursor: "default" }}>Status</div>
              <div className="roster__col-h" style={{ cursor: "default" }}>Created</div>
              <div className="roster__col-h" style={{ cursor: "default" }}>Last opened</div>
              <div className="roster__col-h" style={{ cursor: "default", justifyContent: "flex-end" }}>Actions</div>
            </div>
            <div className="roster__list">
              {invites.map((inv) => {
                const s = statusOf(inv);
                return (
                  <div
                    key={inv.id}
                    className="roster__row"
                    style={{ gridTemplateColumns: "2fr 1.4fr 1fr 0.9fr 0.9fr 0.6fr", cursor: "default" }}
                  >
                    <div className="roster__client">
                      <div className="roster__name" style={{ fontSize: 22 }}>
                        {inv.contactName || "—"}
                      </div>
                      <div className="roster__email">{inv.contactEmail || "—"}</div>
                      {inv.sourceOrderRef && (
                        <div style={{ fontSize: 15, letterSpacing: "0.2em", textTransform: "uppercase", color: "hsl(30 25% 44%)", marginTop: 4 }}>
                          via SureCart · #{inv.sourceOrderRef.slice(-8)}
                          {inv.tier ? ` · ${inv.tier}` : ""}
                        </div>
                      )}
                    </div>
                    <div className="roster__next" style={{ fontSize: 19 }}>
                      {inv.businessName || "—"}
                    </div>
                    <div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 16, letterSpacing: "0.2em", textTransform: "uppercase", color: s.tone }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: s.tone }} />
                        {s.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 17, letterSpacing: "0.15em", color: "hsl(30 8% 62%)", textTransform: "uppercase" }}>
                      {fmtDate(inv.createdAt)}
                    </div>
                    <div style={{ fontSize: 17, letterSpacing: "0.15em", color: "hsl(30 8% 62%)", textTransform: "uppercase" }}>
                      {fmtDate(inv.lastOpenedAt)}
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                      {!inv.revoked && !inv.completedAt && (
                        <button
                          className="crm-btn crm-btn--ghost crm-btn--sm"
                          onClick={() => revoke(inv)}
                          title="Revoke"
                        >
                          <Ban className="h-3 w-3" />
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
