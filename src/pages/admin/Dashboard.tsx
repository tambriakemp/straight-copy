import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Mail, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { differenceInCalendarDays, format } from "date-fns";

interface ClientRow {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  tier: string;
  purchased_at: string | null;
  created_at: string;
}

interface NodeRow {
  client_id: string;
  label: string;
  status: "pending" | "in_progress" | "complete";
  order_index: number;
}

interface RowVM extends ClientRow {
  currentStage: string;
  nextAction: string;
  statusColor: "complete" | "active" | "stale" | "new";
  daysSince: number;
  completePct: number;
}

type SortKey = "business_name" | "tier" | "currentStage" | "daysSince" | "statusColor";

const tierLabel = (t: string) => (t === "growth" ? "Growth" : "Launch");

const dotColor = (s: RowVM["statusColor"]) =>
  s === "complete" ? "bg-emerald-500"
  : s === "active" ? "bg-amber-500"
  : s === "stale" ? "bg-rose-500"
  : "bg-stone-400";

export default function Dashboard() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "daysSince",
    dir: "desc",
  });
  const [form, setForm] = useState({
    business_name: "",
    contact_name: "",
    contact_email: "",
    tier: "launch",
  });

  const load = async () => {
    setLoading(true);
    const [c, n] = await Promise.all([
      supabase
        .from("clients")
        .select("id,business_name,contact_name,contact_email,tier,purchased_at,created_at")
        .eq("archived", false)
        .order("created_at", { ascending: false }),
      supabase
        .from("journey_nodes")
        .select("client_id,label,status,order_index"),
    ]);
    if (c.error) toast.error(c.error.message);
    else setClients((c.data as ClientRow[]) || []);
    if (n.error) toast.error(n.error.message);
    else setNodes((n.data as NodeRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const rows: RowVM[] = useMemo(() => {
    return clients.map((c) => {
      const cn = nodes.filter((x) => x.client_id === c.id).sort((a, b) => a.order_index - b.order_index);
      const total = cn.length || 1;
      const completes = cn.filter((x) => x.status === "complete").length;
      const inProg = cn.find((x) => x.status === "in_progress");
      const firstPending = cn.find((x) => x.status === "pending");
      const lastComplete = [...cn].reverse().find((x) => x.status === "complete");
      const currentStage = inProg?.label ?? lastComplete?.label ?? cn[0]?.label ?? "—";
      const nextAction = inProg
        ? `Finish ${inProg.label}`
        : firstPending
        ? `Start ${firstPending.label}`
        : "All complete";
      const daysSince = differenceInCalendarDays(
        new Date(),
        new Date(c.purchased_at || c.created_at),
      );
      const allDone = completes === cn.length && cn.length > 0;
      const statusColor: RowVM["statusColor"] = allDone
        ? "complete"
        : inProg
        ? "active"
        : daysSince > 14
        ? "stale"
        : "new";
      return {
        ...c,
        currentStage,
        nextAction,
        statusColor,
        daysSince,
        completePct: Math.round((completes / total) * 100),
      };
    });
  }, [clients, nodes]);

  const filtered = useMemo(() => {
    const f = rows.filter((r) => {
      if (tierFilter !== "all" && r.tier !== tierFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (r.business_name || "").toLowerCase().includes(q) ||
          (r.contact_name || "").toLowerCase().includes(q) ||
          (r.contact_email || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...f].sort((a, b) => {
      const av = (a[sort.key] ?? "") as string | number;
      const bv = (b[sort.key] ?? "") as string | number;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, search, tierFilter, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const createClient = async () => {
    if (!form.business_name.trim()) {
      toast.error("Business name required");
      return;
    }
    const { error } = await supabase.from("clients").insert({
      business_name: form.business_name.trim(),
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      tier: form.tier,
      purchased_at: new Date().toISOString(),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Client created");
    setOpen(false);
    setForm({ business_name: "", contact_name: "", contact_email: "", tier: "launch" });
    load();
  };

  return (
    <AdminLayout>
      <div className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.35em] text-stone-500 mb-2">
          Client roster
        </p>
        <h1 className="font-serif text-3xl text-stone-900 italic">All clients</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Input
          placeholder="Search clients…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs bg-white border-stone-300"
        />
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-[140px] bg-white border-stone-300"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            <SelectItem value="launch">Launch</SelectItem>
            <SelectItem value="growth">Growth</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/admin/invites">
            <Button size="sm" variant="outline" className="border-stone-300">
              <Mail className="h-4 w-4 mr-1" /> Invites
            </Button>
          </Link>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-stone-900 hover:bg-stone-800 text-stone-50">
                <Plus className="h-4 w-4" /> New client
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New client</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Business name *</Label>
                  <Input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Contact name</Label>
                  <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Contact email</Label>
                  <Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tier</Label>
                  <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="launch">Launch</SelectItem>
                      <SelectItem value="growth">Growth</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createClient} className="bg-stone-900 hover:bg-stone-800 text-stone-50">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-stone-500">Loading clients…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-stone-200 rounded-sm p-12 text-center">
          <p className="text-sm text-stone-500">No clients yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/60">
                <Th onClick={() => toggleSort("business_name")}>Client</Th>
                <Th onClick={() => toggleSort("tier")}>Tier</Th>
                <Th onClick={() => toggleSort("currentStage")}>Current stage</Th>
                <Th onClick={() => toggleSort("daysSince")} className="text-right">Days since</Th>
                <th className="px-4 py-3 text-left font-normal text-[11px] uppercase tracking-[0.2em] text-stone-500">
                  Next action
                </th>
                <Th onClick={() => toggleSort("statusColor")} className="text-center w-[80px]">
                  Status
                </Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/admin/clients/${r.id}`)}
                  className="border-b border-stone-100 last:border-0 hover:bg-stone-50/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-4">
                    <div className="font-medium text-stone-900">{r.business_name || "Untitled"}</div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      {r.contact_name || r.contact_email || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-stone-600">
                      {tierLabel(r.tier)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-stone-800">{r.currentStage}</div>
                    <div className="mt-1.5 h-px bg-stone-200 w-32 relative overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-stone-700"
                        style={{ width: `${r.completePct}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums text-stone-700">
                    {r.daysSince}d
                    <div className="text-[10px] text-stone-400 mt-0.5">
                      {format(new Date(r.purchased_at || r.created_at), "MMM d")}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-stone-700 italic font-serif">
                    {r.nextAction}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-center">
                      <span
                        className={`block h-2.5 w-2.5 rounded-full ${dotColor(r.statusColor)}`}
                        title={r.statusColor}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-[11px] uppercase tracking-[0.2em] text-stone-500">
        <Legend dot="bg-stone-400" label="New" />
        <Legend dot="bg-amber-500" label="In progress" />
        <Legend dot="bg-rose-500" label="Stale" />
        <Legend dot="bg-emerald-500" label="Complete" />
      </div>
    </AdminLayout>
  );
}

function Th({
  children, onClick, className = "",
}: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <th
      onClick={onClick}
      className={`px-4 py-3 text-left font-normal text-[11px] uppercase tracking-[0.2em] text-stone-500 ${onClick ? "cursor-pointer hover:text-stone-900" : ""} ${className}`}
    >
      <span className="inline-flex items-center gap-1.5">
        {children}
        {onClick && <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </span>
    </th>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`block h-2 w-2 rounded-full ${dot}`} />
      <span>{label}</span>
    </div>
  );
}
