import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { toast } from "sonner";
import { ArrowLeft, Plus, Workflow, MonitorSmartphone, Copy, Check, ExternalLink } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";

type Client = {
  id: string;
  business_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  tier: string;
  archived: boolean;
};

type Project = {
  id: string;
  client_id: string;
  type: "automation_build" | "site_preview";
  name: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type PreviewLink = { id: string; slug: string; client_project_id: string | null };
type NodeRow = { client_project_id: string | null; label: string; status: "pending" | "in_progress" | "complete"; order_index: number };

const TYPE_LABEL: Record<Project["type"], string> = {
  automation_build: "Automation Build",
  site_preview: "Site Preview",
};

const tierLabel = (t: string) => (t === "growth" ? "Growth" : "Launch");

type StageVM = {
  tier: string;
  currentStage: string;
  currentIndex: number;
  total: number;
  completes: number;
  nextAction: string;
  status: "new" | "progress" | "stale" | "complete";
  daysSince: number;
};

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [previews, setPreviews] = useState<Record<string, PreviewLink>>({});
  const [nodesByProject, setNodesByProject] = useState<Record<string, NodeRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);
  const [type, setType] = useState<Project["type"]>("automation_build");
  const [name, setName] = useState("");
  const [tier, setTier] = useState<"launch" | "growth">("launch");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const base = useMemo(() => window.location.origin, []);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [c, p] = await Promise.all([
      supabase.from("clients").select("id,business_name,contact_name,contact_email,contact_phone,tier,archived").eq("id", id).maybeSingle(),
      supabase.from("client_projects").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    ]);
    if (c.error) toast.error(c.error.message);
    setClient((c.data as Client) ?? null);
    const projs = (p.data as Project[]) ?? [];
    setProjects(projs);
    const previewIds = projs.filter(x => x.type === "site_preview").map(x => x.id);
    if (previewIds.length) {
      const { data: pps } = await supabase
        .from("preview_projects")
        .select("id,slug,client_project_id")
        .in("client_project_id", previewIds);
      const map: Record<string, PreviewLink> = {};
      (pps ?? []).forEach((pp: any) => { if (pp.client_project_id) map[pp.client_project_id] = pp; });
      setPreviews(map);
    }
    const buildIds = projs.filter(x => x.type === "automation_build").map(x => x.id);
    if (buildIds.length) {
      const { data: nodes } = await supabase
        .from("journey_nodes")
        .select("client_project_id,label,status,order_index")
        .in("client_project_id", buildIds);
      const grouped: Record<string, NodeRow[]> = {};
      (nodes ?? []).forEach((n: any) => {
        if (!n.client_project_id) return;
        (grouped[n.client_project_id] ||= []).push(n);
      });
      Object.values(grouped).forEach(arr => arr.sort((a, b) => a.order_index - b.order_index));
      setNodesByProject(grouped);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const create = async () => {
    if (!name.trim() || !id) return toast.error("Name required");
    setCreating(true);
    try {
      if (type === "site_preview") {
        const { data, error } = await supabase.functions.invoke("preview-admin", {
          body: { action: "create", name: name.trim(), client_id: id, client_label: client?.business_name ?? null },
        });
        if (error || !data?.project) throw new Error(error?.message || "Failed");
        toast.success("Preview project created");
        navigate(`/admin/clients/${id}/projects/${data.client_project_id}`);
      } else {
        // Automation build: set client tier (drives journey templates), create project, seed journey nodes from templates
        if (client && client.tier !== tier) {
          await supabase.from("clients").update({ tier }).eq("id", id);
        }
        const { data: proj, error } = await supabase
          .from("client_projects")
          .insert({ client_id: id, type, name: name.trim() })
          .select("*").single();
        if (error) throw error;

        const { data: tpls } = await supabase
          .from("journey_templates")
          .select("id,key,label,order_index,checklist")
          .eq("tier", tier)
          .order("order_index");
        if (tpls && tpls.length) {
          await supabase.from("journey_nodes").insert(
            tpls.map((t: any) => ({
              client_id: id,
              client_project_id: proj.id,
              template_id: t.id,
              key: t.key,
              label: t.label,
              order_index: t.order_index,
              checklist: t.checklist,
            }))
          );
        }
        toast.success("Project created");
        navigate(`/admin/clients/${id}/projects/${proj.id}`);
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed");
    } finally {
      setCreating(false);
      setOpenNew(false); setName("");
    }
  };

  const copy = async (e: React.MouseEvent, slug: string, projectId: string) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(`${base}/p/${slug}`);
    setCopiedId(projectId);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (loading) return <AdminLayout><div style={{ padding: 40, color: "var(--crm-taupe)" }}>Loading…</div></AdminLayout>;
  if (!client) return <AdminLayout><div style={{ padding: 40 }}>Client not found.</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="roster">
        <Link to="/admin" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--crm-taupe)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 18 }}>
          <ArrowLeft size={14} /> Back to clients
        </Link>

        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">{client.tier === "growth" ? "Growth" : "Launch"} client</div>
            <h1 className="roster__title">
              {client.business_name || <em>Unnamed</em>}
            </h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              {client.contact_name ? `${client.contact_name} · ` : ""}{client.contact_email || "no email"}{client.contact_phone ? ` · ${client.contact_phone}` : ""}
            </p>
          </div>
        </div>

        <div className="roster__toolbar" style={{ marginTop: 24 }}>
          <div style={{ flex: 1, fontSize: 13, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>
            Projects ({projects.length})
          </div>
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <button className="crm-btn crm-btn--primary"><Plus size={14} /> New project</button>
            </DialogTrigger>
            <DialogContent className="crm-shell !bg-[hsl(36_5%_16%)] !border-[hsl(40_20%_97%/0.08)] !text-[hsl(40_20%_97%)] !rounded-none !max-w-md">
              <DialogHeader>
                <DialogTitle className="font-serif italic text-2xl text-[hsl(40_20%_97%)]">New project</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <label className="crm-label">Type</label>
                  <select className="crm-input" value={type} onChange={(e) => setType(e.target.value as Project["type"])}>
                    <option value="automation_build">Automation Build</option>
                    <option value="site_preview">Site Preview</option>
                  </select>
                </div>
                <div>
                  <label className="crm-label">Project name *</label>
                  <input className="crm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "site_preview" ? "Home v1" : "Launch build"} />
                </div>
                {type === "automation_build" && (
                  <div>
                    <label className="crm-label">Tier</label>
                    <select className="crm-input" value={tier} onChange={(e) => setTier(e.target.value as "launch" | "growth")}>
                      <option value="launch">Launch</option>
                      <option value="growth">Growth</option>
                    </select>
                  </div>
                )}
              </div>
              <DialogFooter>
                <button className="crm-btn crm-btn--ghost" onClick={() => setOpenNew(false)}>Cancel</button>
                <button className="crm-btn crm-btn--primary" onClick={create} disabled={creating}>
                  {creating ? "Creating…" : "Create"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {projects.length === 0 ? (
          <div style={{ padding: "60px 0", color: "var(--crm-taupe)", textAlign: "center", border: "1px dashed var(--crm-border-dark)", borderRadius: 12, marginTop: 16 }}>
            <div style={{ fontSize: 13, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 8 }}>No projects yet</div>
            <div style={{ fontSize: 16 }}>Create the first project for this client above.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16, marginTop: 16 }}>
            {projects.map((p) => {
              const preview = previews[p.id];
              const Icon = p.type === "site_preview" ? MonitorSmartphone : Workflow;
              return (
                <div
                  key={p.id}
                  onClick={() => navigate(`/admin/clients/${id}/projects/${p.id}`)}
                  style={{
                    background: "hsl(40 20% 97% / 0.03)",
                    border: "1px solid var(--crm-border-dark)",
                    borderRadius: 12,
                    padding: "20px 22px",
                    cursor: "pointer",
                    transition: "border-color 200ms",
                    display: "flex", flexDirection: "column", gap: 14,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--crm-accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--crm-border-dark)"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-accent)" }}>
                      <Icon size={12} /> {TYPE_LABEL[p.type]}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--crm-taupe)", textTransform: "uppercase", letterSpacing: "0.2em" }}>{p.status}</span>
                  </div>
                  <div>
                    <h3 style={{ fontFamily: "var(--crm-font-serif)", fontWeight: 300, fontSize: 24, color: "var(--crm-warm-white)", margin: 0, lineHeight: 1.2 }}>
                      {p.name}
                    </h3>
                    <div style={{ marginTop: 6, fontSize: 13, color: "var(--crm-stone)" }}>
                      Updated {new Date(p.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  {preview && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 8, borderTop: "1px solid var(--crm-border-dark)" }}>
                      <code style={{ flex: 1, fontSize: 13, color: "var(--crm-taupe)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        /p/{preview.slug.slice(0, 12)}…
                      </code>
                      <button className="crm-btn crm-btn--ghost crm-btn--sm" onClick={(e) => copy(e, preview.slug, p.id)} title="Copy share link">
                        {copiedId === p.id ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                      <a className="crm-btn crm-btn--ghost crm-btn--sm" href={`${base}/p/${preview.slug}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="Open preview">
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
