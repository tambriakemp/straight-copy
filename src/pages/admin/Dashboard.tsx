import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
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

type StatusKey = "new" | "progress" | "stale" | "complete";

interface RowVM extends ClientRow {
  currentStage: string;
  currentStageIndex: number;
  totalStages: number;
  nextAction: string;
  status: StatusKey;
  daysSince: number;
}

type SortKey = "business_name" | "tier" | "currentStage" | "daysSince" | "status";

const tierLabel = (t: string) => (t === "growth" ? "Growth" : "Launch");

const statusText: Record<StatusKey, string> = {
  new: "New",
  progress: "In Progress",
  stale: "Stale",
  complete: "Complete",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("ALL");
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
      const total = cn.length;
      const completes = cn.filter((x) => x.status === "complete").length;
      const inProg = cn.find((x) => x.status === "in_progress");
      const firstPending = cn.find((x) => x.status === "pending");
      const lastComplete = [...cn].reverse().find((x) => x.status === "complete");
      const currentStageNode = inProg ?? firstPending ?? lastComplete ?? cn[0];
      const currentStage = currentStageNode?.label ?? "—";
      const currentStageIndex = currentStageNode ? currentStageNode.order_index + 1 : 0;
      const nextAction = inProg
        ? `Finish ${inProg.label}`
        : firstPending
        ? `Start ${firstPending.label}`
        : "All complete";
      const daysSince = differenceInCalendarDays(
        new Date(),
        new Date(c.purchased_at || c.created_at),
      );
      const allDone = total > 0 && completes === total;
      const status: StatusKey = allDone
        ? "complete"
        : inProg
        ? "progress"
        : daysSince > 60
        ? "stale"
        : daysSince > 14 && completes === 0
        ? "stale"
        : completes === 0
        ? "new"
        : "progress";
      return {
        ...c,
        currentStage,
        currentStageIndex,
        totalStages: total,
        nextAction,
        status,
        daysSince,
      };
    });
  }, [clients, nodes]);

  const filtered = useMemo(() => {
    const f = rows.filter((r) => {
      if (tierFilter !== "ALL" && r.tier.toUpperCase() !== tierFilter) return false;
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
      <div className="roster">
        <div className="roster__ghost">CRE8</div>

        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">Client Roster</div>
            <h1 className="roster__title">All <em>clients</em></h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              Every brand on our books and where they sit in the development journey.
              Click a row to open the interactive journey view.
            </p>
          </div>
        </div>

        <div className="roster__toolbar">
          <div className="roster__search-wrap">
            <input
              className="roster__search"
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="roster__select" value={tierFilter} onChange={(e) => setTierFilter(e.target.value)}>
            <option value="ALL">All tiers</option>
            <option value="LAUNCH">Launch</option>
            <option value="GROWTH">Growth</option>
          </select>
          <div className="roster__actions">
            <button className="crm-btn crm-btn--ghost" onClick={() => navigate("/admin/invites")}>
              ✉ Invites
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button className="crm-btn crm-btn--primary">+ New Client</button>
              </DialogTrigger>
              <DialogContent className="crm-shell !bg-[hsl(36_5%_16%)] !border-[hsl(40_20%_97%/0.08)] !text-[hsl(40_20%_97%)] !rounded-none !max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-serif italic text-2xl text-[hsl(40_20%_97%)]">New client</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div>
                    <label className="crm-label">Business name *</label>
                    <input
                      className="crm-input"
                      value={form.business_name}
                      onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="crm-label">Contact name</label>
                    <input
                      className="crm-input"
                      value={form.contact_name}
                      onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="crm-label">Contact email</label>
                    <input
                      type="email"
                      className="crm-input"
                      value={form.contact_email}
                      onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="crm-label">Tier</label>
                    <select
                      className="crm-input"
                      value={form.tier}
                      onChange={(e) => setForm({ ...form, tier: e.target.value })}
                    >
                      <option value="launch">Launch</option>
                      <option value="growth">Growth</option>
                    </select>
                  </div>
                </div>
                <DialogFooter className="mt-2">
                  <button className="crm-btn crm-btn--bronze" onClick={createClient}>
                    Create
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <p className="text-[hsl(30_8%_62%)] text-sm">Loading clients…</p>
        ) : filtered.length === 0 ? (
          <div className="crm-empty">
            <div className="crm-empty__glyph">∅</div>
            <div className="crm-empty__title">No <em>clients</em> yet.</div>
            <div className="crm-empty__sub">
              Send an invite or create a client to start tracking a journey.
              New arrivals will appear here the moment they purchase.
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
              <button className="crm-btn crm-btn--ghost" onClick={() => navigate("/admin/invites")}>
                ✉ Send Invite
              </button>
              <button className="crm-btn crm-btn--bronze" onClick={() => setOpen(true)}>
                + New Client
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="roster__head-row">
              <button className="roster__col-h" onClick={() => toggleSort("business_name")}>Client ↕</button>
              <button className="roster__col-h" onClick={() => toggleSort("tier")}>Tier ↕</button>
              <button className="roster__col-h" onClick={() => toggleSort("currentStage")}>Current Stage ↕</button>
              <button className="roster__col-h" onClick={() => toggleSort("daysSince")}>Days Since ↕</button>
              <div className="roster__col-h" style={{ cursor: "default" }}>Next Action</div>
              <button className="roster__col-h" onClick={() => toggleSort("status")}>Status ↕</button>
              <div />
            </div>

            <div className="roster__list">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="roster__row"
                  onClick={() => navigate(`/admin/clients/${r.id}`)}
                >
                  <div className="roster__client">
                    <div className="roster__name">{r.business_name || "Untitled"}</div>
                    <div className="roster__email">
                      {r.contact_email || r.contact_name || "—"}
                    </div>
                  </div>
                  <div className={`roster__tier roster__tier--${r.tier.toLowerCase()}`}>
                    {tierLabel(r.tier)}
                  </div>
                  <div>
                    <div className="roster__stage">{r.currentStage}</div>
                    <span className="roster__stage-hint">
                      {String(r.currentStageIndex).padStart(2, "0")} / {String(r.totalStages || 0).padStart(2, "0")}
                    </span>
                  </div>
                  <div>
                    <div className="roster__days">{r.daysSince}d</div>
                    <span className="roster__days-date">
                      {format(new Date(r.purchased_at || r.created_at), "MMM d")}
                    </span>
                  </div>
                  <div className="roster__next">{r.nextAction}</div>
                  <div className="roster__status">
                    <span className={`status-dot status-dot--${r.status}`} />
                    {statusText[r.status]}
                  </div>
                  <div className="roster__row-actions" onClick={(e) => e.stopPropagation()}>
                    <a
                      className="roster__portal-link"
                      href={`/portal/${r.id}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Open client portal in new tab"
                    >
                      ◉ Portal ↗
                    </a>
                    <span className="roster__chevron">→</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="roster__legend">
              <span className="roster__legend-item"><span className="status-dot status-dot--new" /> New</span>
              <span className="roster__legend-item"><span className="status-dot status-dot--progress" /> In Progress</span>
              <span className="roster__legend-item"><span className="status-dot status-dot--stale" /> Stale</span>
              <span className="roster__legend-item"><span className="status-dot status-dot--complete" /> Complete</span>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
