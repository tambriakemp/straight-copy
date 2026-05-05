import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";

type Project = {
  id: string;
  name: string;
  client_label: string | null;
  slug: string;
  storage_prefix: string;
  entry_path: string;
  is_multi_page: boolean;
  feedback_enabled: boolean;
  archived: boolean;
  created_at: string;
};

export default function Previews() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "archived">("active");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const base = useMemo(() => window.location.origin, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("preview-admin", { body: { action: "list" } });
    if (error) toast.error(error.message);
    else setProjects(data?.projects ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return toast.error("Name required");
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("preview-admin", {
      body: { action: "create", name: name.trim(), client_label: clientLabel.trim() || null },
    });
    setCreating(false);
    if (error || !data?.project) return toast.error(error?.message || "Failed");
    setOpen(false);
    setName(""); setClientLabel("");
    toast.success("Preview created — now upload your files.");
    navigate(`/admin/previews/${data.project.id}`);
  };

  const copy = async (e: React.MouseEvent, p: Project) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(`${base}/p/${p.slug}`);
    setCopiedId(p.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const filtered = projects.filter((p) => {
    if (statusFilter === "active" && p.archived) return false;
    if (statusFilter === "archived" && !p.archived) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (p.name + " " + (p.client_label ?? "")).toLowerCase().includes(s);
  });

  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__ghost">PREVIEW</div>

        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">Preview Sandbox</div>
            <h1 className="roster__title">Site <em>previews</em></h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              Upload mockups, share an unguessable link, and collect pin-point feedback from your client.
              Every project keeps its own pages, assets, and Kanban feedback board.
            </p>
          </div>
        </div>

        <div className="roster__toolbar">
          <div className="roster__search-wrap">
            <input
              className="roster__search"
              placeholder="Search previews..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="roster__select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
          <div className="roster__actions">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <button className="crm-btn crm-btn--primary"><Plus size={14} /> New preview</button>
              </DialogTrigger>
              <DialogContent className="crm-shell !bg-[hsl(36_5%_16%)] !border-[hsl(40_20%_97%/0.08)] !text-[hsl(40_20%_97%)] !rounded-none !max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-serif italic text-2xl text-[hsl(40_20%_97%)]">New preview</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div>
                    <label className="crm-label">Project name *</label>
                    <input className="crm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Magna Tax Relief — Home v1" />
                  </div>
                  <div>
                    <label className="crm-label">Client label (optional)</label>
                    <input className="crm-input" value={clientLabel} onChange={(e) => setClientLabel(e.target.value)} placeholder="Magna Tax Relief" />
                  </div>
                </div>
                <DialogFooter>
                  <button className="crm-btn crm-btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
                  <button className="crm-btn crm-btn--primary" onClick={create} disabled={creating}>
                    {creating ? "Creating…" : "Create"}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "48px 0", color: "var(--crm-taupe)", fontStyle: "italic" }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "60px 0", color: "var(--crm-taupe)", textAlign: "center", border: "1px dashed var(--crm-border-dark)", borderRadius: 12 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 8 }}>No previews</div>
            <div style={{ fontSize: 16 }}>Create your first preview project above.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {filtered.map((p) => {
              const url = `${base}/p/${p.slug}`;
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/admin/previews/${p.id}`)}
                  style={{
                    background: "hsl(40 20% 97% / 0.03)",
                    border: "1px solid var(--crm-border-dark)",
                    borderRadius: 12,
                    padding: "20px 22px",
                    cursor: "pointer",
                    transition: "border-color 200ms, background 200ms",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--crm-accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--crm-border-dark)"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: p.archived ? "hsl(0 50% 65%)" : "var(--crm-accent)" }}>
                      {p.archived ? "Archived" : p.feedback_enabled ? "Live" : "Feedback off"}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--crm-taupe)" }}>{new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <h3 style={{ fontFamily: "var(--crm-font-serif)", fontWeight: 300, fontSize: 26, color: "var(--crm-warm-white)", margin: 0, lineHeight: 1.2 }}>
                      {p.name}
                    </h3>
                    {p.client_label && (
                      <div style={{ marginTop: 6, fontSize: 14, color: "var(--crm-stone)" }}>{p.client_label}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 8, borderTop: "1px solid var(--crm-border-dark)" }}>
                    <code style={{ flex: 1, fontSize: 13, color: "var(--crm-taupe)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      /p/{p.slug.slice(0, 12)}…
                    </code>
                    <button
                      className="crm-btn crm-btn--ghost crm-btn--sm"
                      onClick={(e) => copy(e, p)}
                      title="Copy share link"
                    >
                      {copiedId === p.id ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    <a
                      className="crm-btn crm-btn--ghost crm-btn--sm"
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Open preview"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
