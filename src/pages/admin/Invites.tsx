import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Copy, Check, Ban, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
};

function randomToken(len = 24) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

function statusOf(inv: Invite): { label: string; tone: string } {
  const now = Date.now();
  if (inv.revoked) return { label: "Revoked", tone: "bg-zinc-100 text-zinc-600" };
  if (inv.completed_at) return { label: "Completed", tone: "bg-emerald-100 text-emerald-700" };
  if (inv.expires_at && new Date(inv.expires_at).getTime() < now)
    return { label: "Expired", tone: "bg-amber-100 text-amber-700" };
  if (inv.submission_id) return { label: "In progress", tone: "bg-blue-100 text-blue-700" };
  if (inv.last_opened_at) return { label: "Opened", tone: "bg-indigo-100 text-indigo-700" };
  return { label: "Not opened", tone: "bg-zinc-100 text-zinc-600" };
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

  useEffect(() => {
    load();
  }, []);

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
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Onboarding Invites</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Generate personalized links so prospects can complete onboarding at their own pace.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> New Invite
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create invite link</DialogTitle>
              <DialogDescription>
                The link will be copied to your clipboard. Send it via your own email or DM.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Contact name</Label>
                <Input
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Contact email</Label>
                <Input
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  placeholder="jane@studio.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Business name</Label>
                <Input
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  placeholder="Studio Name"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Internal note (optional)</Label>
                <Textarea
                  rows={2}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="Lead from Instagram DM, mentioned wanting brand voice work"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Link expires</Label>
                <Select value={form.expiry} onValueChange={(v) => setForm({ ...form, expiry: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">In 7 days</SelectItem>
                    <SelectItem value="30">In 30 days</SelectItem>
                    <SelectItem value="90">In 90 days</SelectItem>
                    <SelectItem value="never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={create}>Create & copy link</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-zinc-500">Loading invites…</p>
        ) : invites.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-zinc-500 mb-3">No invites yet.</p>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Create your first invite
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last opened</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((inv) => {
                const s = statusOf(inv);
                return (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <div className="font-medium text-zinc-900">
                        {inv.contact_name || "—"}
                      </div>
                      <div className="text-xs text-zinc-500">{inv.contact_email || "—"}</div>
                    </TableCell>
                    <TableCell className="text-sm text-zinc-700">
                      {inv.business_name || "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                          s.tone
                        )}
                      >
                        {s.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {fmtDate(inv.created_at)}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-500">
                      {fmtDate(inv.last_opened_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyLink(inv)}
                          disabled={inv.revoked}
                          title="Copy link"
                        >
                          {copiedId === inv.id ? (
                            <Check className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <a
                          href={linkFor(inv.token)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex"
                        >
                          <Button size="sm" variant="ghost" title="Open link">
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </a>
                        {inv.submission_id && (
                          <Link to={`/admin/clients/${inv.submission_id}`} className="inline-flex">
                            <Button size="sm" variant="ghost" title="View submission">
                              View
                            </Button>
                          </Link>
                        )}
                        {!inv.revoked && !inv.completed_at && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => revoke(inv)}
                            title="Revoke"
                          >
                            <Ban className="h-4 w-4 text-zinc-500" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </AdminLayout>
  );
}
