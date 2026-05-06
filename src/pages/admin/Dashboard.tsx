import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

interface ClientRow {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  created_at: string;
}

type SortKey = "business_name" | "created_at";

export default function Dashboard() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "created_at",
    dir: "desc",
  });
  const [form, setForm] = useState({
    business_name: "",
    contact_name: "",
    contact_email: "",
  });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("id,business_name,contact_name,contact_email,created_at")
      .eq("archived", false)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setClients((data as ClientRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const f = clients.filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (r.business_name || "").toLowerCase().includes(q) ||
        (r.contact_name || "").toLowerCase().includes(q) ||
        (r.contact_email || "").toLowerCase().includes(q)
      );
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...f].sort((a, b) => {
      const av = (a[sort.key] ?? "") as string;
      const bv = (b[sort.key] ?? "") as string;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [clients, search, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const createClient = async () => {
    if (!form.business_name.trim()) {
      toast.error("Business name required");
      return;
    }
    const { data, error } = await supabase.from("clients").insert({
      business_name: form.business_name.trim(),
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      purchased_at: new Date().toISOString(),
    }).select("id").single();
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Client created");
    setOpen(false);
    setForm({ business_name: "", contact_name: "", contact_email: "" });
    if (data?.id) navigate(`/admin/clients/${data.id}`);
    else load();
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
              Every brand on our books. Open a client to see their projects — automation builds and site previews.
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
              Send an invite or create a client to start tracking projects.
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
          <div className="roster__list" style={{ borderTop: "1px solid var(--crm-border-dark)" }}>
            {filtered.map((r) => (
              <div
                key={r.id}
                onClick={() => navigate(`/admin/clients/${r.id}`)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 44px",
                  alignItems: "center",
                  gap: 24,
                  padding: "24px 28px",
                  background: "var(--crm-charcoal)",
                  borderBottom: "1px solid var(--crm-border-dark)",
                  cursor: "pointer",
                  transition: "background 200ms",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "hsl(36 5% 20%)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--crm-charcoal)"; }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <div className="roster__name">{r.business_name || "Untitled"}</div>
                  <div className="roster__email">
                    {[r.contact_name, r.contact_email].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div style={{ textAlign: "right", color: "var(--crm-taupe)", fontSize: 18 }}>→</div>
              </div>
            ))}
            <div style={{ marginTop: 16, fontSize: 12, color: "var(--crm-taupe)", letterSpacing: "0.2em", textTransform: "uppercase" }}>
              Sort: <button className="roster__col-h" style={{ marginLeft: 8 }} onClick={() => toggleSort("business_name")}>Name ↕</button>
              <button className="roster__col-h" style={{ marginLeft: 8 }} onClick={() => toggleSort("created_at")}>Created ↕</button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
