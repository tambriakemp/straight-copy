import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Copy, Check, Ban, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type Invite = {
  id: string;
  token: string;
  contact_name: string | null;
  contact_email: string | null;
  business_name: string | null;
  note: string | null;
  expires_at: string | null;
  submission_id: string | null;
  last_opened_at: string | null;
  completed_at: string | null;
  revoked: boolean;
  created_at: string;
  source_order_id: string | null;
  tier: string | null;
};

function randomToken(len = 24) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

function statusOf(inv: Invite): { label: string; tone: string } {
  const now = Date.now();
  if (inv.revoked) return { label: "Revoked", tone: "hsl(30 10% 78%)" };
  if (inv.completed_at) return { label: "Completed", tone: "hsl(150 35% 70%)" };
  if (inv.expires_at && new Date(inv.expires_at).getTime() < now)
    return { label: "Expired", tone: "hsl(8 55% 70%)" };
  if (inv.submission_id) return { label: "In progress", tone: "hsl(30 25% 44%)" };
  if (inv.last_opened_at) return { label: "Opened", tone: "hsl(30 10% 78%)" };
  return { label: "Not opened", tone: "hsl(30 8% 62%)" };
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

export default function Invites() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
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
    const { data, error } = await supabase
      .from("onboarding_invites")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setInvites((data as Invite[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const linkFor = (token: string) => `${baseUrl}/onboarding?invite=${token}`;

  const copyLink = async (inv: Invite) => {
    await navigator.clipboard.writeText(linkFor(inv.token));
    setCopiedId(inv.id);
    toast.success("Link copied");
    setTimeout(() => setCopiedId(null), 1500);
  };

  const create = async () => {
    if (!form.contact_name.trim() && !form.contact_email.trim()) {
      toast.error("Add at least a name or email");
      return;
    }
    const expires_at =
      form.expiry === "never"
        ? null
        : new Date(Date.now() + parseInt(form.expiry, 10) * 86400000).toISOString();

    const token = randomToken(20);
    const { data, error } = await supabase
      .from("onboarding_invites")
      .insert({
        token,
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        business_name: form.business_name.trim() || null,
        note: form.note.trim() || null,
        expires_at,
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
      return;
    }

    const url = linkFor((data as Invite).token);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite created — link copied to clipboard");
    } catch {
      toast.success("Invite created");
    }
    setOpen(false);
    setForm({ contact_name: "", contact_email: "", business_name: "", note: "", expiry: "30" });
    load();
  };

  const revoke = async (inv: Invite) => {
    if (!confirm(`Revoke invite for ${inv.contact_name || inv.contact_email || "this prospect"}?`))
      return;
    const { error } = await supabase
      .from("onboarding_invites")
      .update({ revoked: true })
      .eq("id", inv.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Invite revoked");
      load();
    }
  };

  return (
    <AdminLayout>
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
                    <option value="never">Never</option>
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
            <div className="roster__head-row" style={{ gridTemplateColumns: "2fr 1.4fr 1fr 0.9fr 0.9fr 1.2fr" }}>
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
                    style={{ gridTemplateColumns: "2fr 1.4fr 1fr 0.9fr 0.9fr 1.2fr", cursor: "default" }}
                  >
                    <div className="roster__client">
                      <div className="roster__name" style={{ fontSize: 16 }}>
                        {inv.contact_name || "—"}
                      </div>
                      <div className="roster__email">{inv.contact_email || "—"}</div>
                      {inv.source_order_id && (
                        <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: "hsl(30 25% 44%)", marginTop: 4 }}>
                          via SureCart · #{inv.source_order_id.slice(-8)}
                          {inv.tier ? ` · ${inv.tier}` : ""}
                        </div>
                      )}
                    </div>
                    <div className="roster__next" style={{ fontSize: 13 }}>
                      {inv.business_name || "—"}
                    </div>
                    <div>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: s.tone }}>
                        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: s.tone }} />
                        {s.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "hsl(30 8% 62%)", textTransform: "uppercase" }}>
                      {fmtDate(inv.created_at)}
                    </div>
                    <div style={{ fontSize: 11, letterSpacing: "0.15em", color: "hsl(30 8% 62%)", textTransform: "uppercase" }}>
                      {fmtDate(inv.last_opened_at)}
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                      <button
                        className="crm-btn crm-btn--ghost crm-btn--sm"
                        onClick={() => copyLink(inv)}
                        disabled={inv.revoked}
                        title="Copy link"
                      >
                        {copiedId === inv.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </button>
                      <a href={linkFor(inv.token)} target="_blank" rel="noreferrer">
                        <button className="crm-btn crm-btn--ghost crm-btn--sm" title="Open">
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </a>
                      {inv.submission_id && (
                        <Link to={`/admin/clients/${inv.submission_id}`}>
                          <button className="crm-btn crm-btn--ghost crm-btn--sm">View</button>
                        </Link>
                      )}
                      {!inv.revoked && !inv.completed_at && (
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
