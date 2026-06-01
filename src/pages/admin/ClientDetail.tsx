import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { toast } from "sonner";
import { ArrowLeft, Plus, Workflow, MonitorSmartphone, Copy, Check, ExternalLink, FolderOpen, FileSignature, Globe, Megaphone, Pencil, Star, Trash2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import ProjectResourcesSheet from "@/components/admin/ProjectResourcesSheet";
import ClientPortalActions from "@/components/admin/ClientPortalActions";

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
  type: "automation_build" | "site_preview" | "app_development" | "web_development" | "marketing";
  name: string;
  business_name: string | null;
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
  app_development: "App Development",
  web_development: "Web Development",
  marketing: "Marketing",
};

const tierLabel = (t: string) => (t === "growth" ? "Growth" : "Launch");

type ContactRow = {
  id?: string;
  _localKey: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  is_primary: boolean;
};

const makeLocalKey = () => `new_${Math.random().toString(36).slice(2, 10)}`;


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
  const [projectBusinessName, setProjectBusinessName] = useState("");
  const [tier, setTier] = useState<"launch" | "growth">("launch");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resourceProject, setResourceProject] = useState<Project | null>(null);
  const [openEdit, setOpenEdit] = useState(false);
  const [editForm, setEditForm] = useState({ business_name: "" });
  const [editContacts, setEditContacts] = useState<ContactRow[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [projectEditForm, setProjectEditForm] = useState({ name: "", business_name: "", notes: "" });
  const [savingProjectEdit, setSavingProjectEdit] = useState(false);

  const openProjectEdit = (e: React.MouseEvent, p: Project) => {
    e.stopPropagation();
    setProjectEditForm({ name: p.name ?? "", business_name: p.business_name ?? "", notes: p.notes ?? "" });
    setEditProject(p);
  };

  const saveProjectEdit = async () => {
    if (!editProject) return;
    setSavingProjectEdit(true);
    const { error } = await supabase.from("client_projects").update({
      name: projectEditForm.name.trim() || editProject.name,
      business_name: projectEditForm.business_name.trim() || null,
      notes: projectEditForm.notes.trim() || null,
    }).eq("id", editProject.id);
    setSavingProjectEdit(false);
    if (error) return toast.error(error.message);
    toast.success("Project updated");
    setEditProject(null);
    load();
  };

  const openEditDialog = async () => {
    if (!client) return;
    setEditForm({ business_name: client.business_name ?? "" });
    // Load existing contacts
    const { data: rows } = await supabase
      .from("client_contacts")
      .select("id, name, email, phone, role, is_primary, order_index")
      .eq("client_id", client.id)
      .order("is_primary", { ascending: false })
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });
    let list: ContactRow[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      _localKey: r.id,
      name: r.name ?? "",
      email: r.email ?? "",
      phone: r.phone ?? "",
      role: r.role ?? "",
      is_primary: !!r.is_primary,
    }));
    if (list.length === 0) {
      // Seed from legacy fields if nothing migrated
      list = [{
        _localKey: makeLocalKey(),
        name: client.contact_name ?? "",
        email: client.contact_email ?? "",
        phone: client.contact_phone ?? "",
        role: "",
        is_primary: true,
      }];
    } else if (!list.some((c) => c.is_primary)) {
      list[0].is_primary = true;
    }
    setEditContacts(list);
    setOpenEdit(true);
  };

  const addContactRow = () => {
    setEditContacts((prev) => [
      ...prev,
      { _localKey: makeLocalKey(), name: "", email: "", phone: "", role: "", is_primary: prev.length === 0 },
    ]);
  };

  const updateContactRow = (key: string, patch: Partial<ContactRow>) => {
    setEditContacts((prev) => prev.map((c) => (c._localKey === key ? { ...c, ...patch } : c)));
  };

  const removeContactRow = (key: string) => {
    setEditContacts((prev) => {
      const next = prev.filter((c) => c._localKey !== key);
      // Ensure exactly one primary if any remain
      if (next.length > 0 && !next.some((c) => c.is_primary)) {
        next[0] = { ...next[0], is_primary: true };
      }
      return next;
    });
  };

  const setPrimaryContact = (key: string) => {
    setEditContacts((prev) => prev.map((c) => ({ ...c, is_primary: c._localKey === key })));
  };

  const saveEdit = async () => {
    if (!id || !client) return;
    // Validate
    const cleaned = editContacts
      .map((c) => ({ ...c, name: c.name.trim(), email: c.email.trim(), phone: c.phone.trim(), role: c.role.trim() }))
      .filter((c) => c.name || c.email || c.phone);
    if (cleaned.length > 0 && !cleaned.some((c) => c.is_primary)) {
      cleaned[0].is_primary = true;
    }
    const primaryCount = cleaned.filter((c) => c.is_primary).length;
    if (primaryCount > 1) {
      return toast.error("Only one contact can be marked primary");
    }
    const primary = cleaned.find((c) => c.is_primary) ?? null;

    setSavingEdit(true);
    try {
      // 1) Update business_name + legacy mirror to primary
      const updateClient: Record<string, any> = {
        business_name: editForm.business_name.trim() || null,
        contact_name: primary?.name || null,
        contact_email: primary?.email || null,
        contact_phone: primary?.phone || null,
      };
      const { error: clientErr } = await supabase.from("clients").update(updateClient).eq("id", id);
      if (clientErr) throw clientErr;

      // 2) Sync client_contacts: delete missing, upsert remaining
      const keptIds = cleaned.filter((c) => c.id).map((c) => c.id as string);
      // Fetch current ids to find ones to delete
      const { data: current } = await supabase
        .from("client_contacts")
        .select("id")
        .eq("client_id", id);
      const toDelete = (current ?? [])
        .map((r: any) => r.id as string)
        .filter((cid) => !keptIds.includes(cid));

      // To avoid the partial unique index conflict during reassignment,
      // first clear is_primary on all existing rows, then upsert with final values.
      if ((current ?? []).length > 0) {
        await supabase.from("client_contacts").update({ is_primary: false }).eq("client_id", id);
      }

      if (toDelete.length) {
        await supabase.from("client_contacts").delete().in("id", toDelete);
      }

      // Upsert remaining (existing rows by id, new rows insert)
      for (let i = 0; i < cleaned.length; i++) {
        const c = cleaned[i];
        const payload = {
          client_id: id,
          name: c.name || null,
          email: c.email || null,
          phone: c.phone || null,
          role: c.role || null,
          is_primary: c.is_primary,
          order_index: i,
        };
        if (c.id) {
          const { error } = await supabase.from("client_contacts").update(payload).eq("id", c.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("client_contacts").insert(payload);
          if (error) throw error;
        }
      }
      toast.success("Client updated");
      setOpenEdit(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save");
    } finally {
      setSavingEdit(false);
    }
  };


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
      if (type === "app_development" || type === "web_development" || type === "marketing") {
        const { data: proj, error } = await supabase
          .from("client_projects")
          .insert({ client_id: id, type, name: name.trim(), business_name: projectBusinessName.trim() || null })
          .select("*").single();
        if (error) throw error;
        toast.success(`${TYPE_LABEL[type]} project created`);
        navigate(`/admin/clients/${id}/projects/${proj.id}`);
      } else {
        // Automation build: set client tier (drives journey templates), create project, seed journey nodes from templates
        if (client && client.tier !== tier) {
          await supabase.from("clients").update({ tier }).eq("id", id);
        }
        const { data: proj, error } = await supabase
          .from("client_projects")
          .insert({ client_id: id, type, name: name.trim(), business_name: projectBusinessName.trim() || null })
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
      setOpenNew(false); setName(""); setProjectBusinessName("");
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
        <Link to="/admin" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--crm-taupe)", fontSize: 15, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 18 }}>
          <ArrowLeft size={14} /> Back to clients
        </Link>

        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">Client</div>
            <h1 className="roster__title" style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
              {client.contact_name || <em>Unnamed</em>}
              <button
                className="crm-btn crm-btn--ghost crm-btn--sm"
                onClick={openEditDialog}
                title="Edit client"
                style={{ fontSize: 12 }}
              >
                <Pencil size={12} /> Edit
              </button>
            </h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              {client.contact_email || "no email"}{client.contact_phone ? ` · ${client.contact_phone}` : ""}
            </p>
          </div>
          <ClientPortalActions clientId={client.id} />
        </div>

        <div className="roster__toolbar" style={{ marginTop: 24 }}>
          <div style={{ flex: 1, fontSize: 15, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>
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
                    <option value="app_development">App Development</option>
                    <option value="web_development">Web Development</option>
                    <option value="marketing">Marketing</option>
                  </select>
                </div>
                <div>
                  <label className="crm-label">Project name *</label>
                  <input className="crm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={type === "app_development" ? "Mobile app v1" : type === "web_development" ? "Website v1" : type === "marketing" ? "Campaign v1" : "Launch build"} />
                </div>
                <div>
                  <label className="crm-label">Business name</label>
                  <input className="crm-input" value={projectBusinessName} onChange={(e) => setProjectBusinessName(e.target.value)} placeholder="Which business this project is for" />
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
            <div style={{ fontSize: 15, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 8 }}>No projects yet</div>
            <div style={{ fontSize: 18 }}>Create the first project for this client above.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16, marginTop: 16 }}>
            {projects.map((p) => {
              const preview = previews[p.id];
              const Icon = p.type === "site_preview" ? MonitorSmartphone
                : p.type === "app_development" ? FileSignature
                : p.type === "web_development" ? Globe
                : p.type === "marketing" ? Megaphone
                : Workflow;
              const isBuild = p.type === "automation_build";
              const cn = isBuild ? (nodesByProject[p.id] ?? []) : [];
              const total = cn.length;
              const completes = cn.filter(x => x.status === "complete").length;
              const inProg = cn.find(x => x.status === "in_progress");
              const firstPending = cn.find(x => x.status === "pending");
              const stageNode = inProg ?? firstPending ?? [...cn].reverse().find(x => x.status === "complete") ?? cn[0];
              const stageLabel = stageNode?.label ?? "—";
              const stageIdx = stageNode ? stageNode.order_index + 1 : 0;
              const nextAction = inProg ? `Finish ${inProg.label}` : firstPending ? `Start ${firstPending.label}` : total > 0 ? "All complete" : "Not started";
              const daysSince = Math.max(0, Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000));
              const allDone = total > 0 && completes === total;
              const stageStatus: "new" | "progress" | "stale" | "complete" = allDone
                ? "complete"
                : inProg
                ? "progress"
                : daysSince > 60 || (daysSince > 14 && completes === 0)
                ? "stale"
                : completes === 0
                ? "new"
                : "progress";
              const statusText = { new: "New", progress: "In Progress", stale: "Stale", complete: "Complete" }[stageStatus];
              const tierForCard = (client?.tier ?? "launch");

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
                    position: "relative",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--crm-accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--crm-border-dark)"; }}
                >
                  <span
                    title={isBuild ? statusText : p.status}
                    style={{
                      position: "absolute",
                      top: 12,
                      left: 12,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "hsl(140 60% 45%)",
                      boxShadow: "0 0 0 3px hsl(140 60% 45% / 0.18)",
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", paddingLeft: 18 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--crm-accent)", whiteSpace: "nowrap" }}>
                      <Icon size={12} style={{ flexShrink: 0 }} /> {TYPE_LABEL[p.type]}
                    </span>
                    {isBuild && (
                      <span className={`roster__tier roster__tier--${tierForCard.toLowerCase()}`}>{tierLabel(tierForCard)}</span>
                    )}
                  </div>
                  <div>
                    <h3 style={{ fontFamily: "var(--crm-font-serif)", fontWeight: 300, fontSize: 26, color: "var(--crm-warm-white)", margin: 0, lineHeight: 1.2 }}>
                      {p.name}
                    </h3>
                    {p.business_name && (
                      <div style={{ marginTop: 4, fontSize: 13, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--crm-taupe)" }}>
                        {p.business_name}
                      </div>
                    )}
                  </div>

                  {isBuild && (
                    <>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end", paddingTop: 4 }}>
                        <div>
                          <div className="roster__stage" style={{ fontSize: 18, lineHeight: 1.2 }}>{stageLabel}</div>
                          <span className="roster__stage-hint">
                            {String(stageIdx).padStart(2, "0")} / {String(total || 0).padStart(2, "0")}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ textAlign: "right" }}>
                            <div className="roster__days" style={{ fontSize: 26 }}>{daysSince}d</div>
                            <span className="roster__days-date">since start</span>
                          </div>
                          <button
                            className="crm-btn crm-btn--ghost crm-btn--sm"
                            onClick={(e) => openProjectEdit(e, p)}
                            title="Edit project"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            className="crm-btn crm-btn--ghost crm-btn--sm"
                            onClick={(e) => { e.stopPropagation(); setResourceProject(p); }}
                            title="Links & notes"
                          >
                            <FolderOpen size={12} />
                          </button>
                        </div>
                      </div>
                      <div style={{ fontFamily: "var(--crm-font-serif)", fontStyle: "italic", color: "var(--crm-stone)", fontSize: 16 }}>
                        {nextAction}
                      </div>
                    </>
                  )}

                  {!isBuild && (
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 15, color: "var(--crm-stone)" }}>
                        Updated {new Date(p.updated_at).toLocaleDateString()}
                      </span>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <button
                          className="crm-btn crm-btn--ghost crm-btn--sm"
                          onClick={(e) => openProjectEdit(e, p)}
                          title="Edit project"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          className="crm-btn crm-btn--ghost crm-btn--sm"
                          onClick={(e) => { e.stopPropagation(); setResourceProject(p); }}
                          title="Links & notes"
                        >
                          <FolderOpen size={12} />
                        </button>
                      </div>
                    </div>
                  )}


                  {preview && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 8, borderTop: "1px solid var(--crm-border-dark)" }}>
                      <code style={{ flex: 1, fontSize: 15, color: "var(--crm-taupe)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
      <ProjectResourcesSheet
        projectId={resourceProject?.id ?? null}
        projectName={resourceProject?.name}
        open={!!resourceProject}
        onOpenChange={(v) => { if (!v) setResourceProject(null); }}
      />
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="crm-shell !bg-[hsl(36_5%_16%)] !border-[hsl(40_20%_97%/0.08)] !text-[hsl(40_20%_97%)] !rounded-none !max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif italic text-2xl text-[hsl(40_20%_97%)]">Edit client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="crm-label">Business name</label>
              <input className="crm-input" value={editForm.business_name} onChange={(e) => setEditForm({ ...editForm, business_name: e.target.value })} />
            </div>
            <div>
              <label className="crm-label">Contact name</label>
              <input className="crm-input" value={editForm.contact_name} onChange={(e) => setEditForm({ ...editForm, contact_name: e.target.value })} />
            </div>
            <div>
              <label className="crm-label">Contact email</label>
              <input className="crm-input" type="email" value={editForm.contact_email} onChange={(e) => setEditForm({ ...editForm, contact_email: e.target.value })} />
            </div>
            <div>
              <label className="crm-label">Contact phone</label>
              <input className="crm-input" value={editForm.contact_phone} onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <button className="crm-btn crm-btn--ghost" onClick={() => setOpenEdit(false)}>Cancel</button>
            <button className="crm-btn crm-btn--primary" onClick={saveEdit} disabled={savingEdit}>
              {savingEdit ? "Saving…" : "Save"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editProject} onOpenChange={(v) => { if (!v) setEditProject(null); }}>
        <DialogContent className="crm-shell !bg-[hsl(36_5%_16%)] !border-[hsl(40_20%_97%/0.08)] !text-[hsl(40_20%_97%)] !rounded-none !max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif italic text-2xl text-[hsl(40_20%_97%)]">Edit project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="crm-label">Project name</label>
              <input className="crm-input" value={projectEditForm.name} onChange={(e) => setProjectEditForm({ ...projectEditForm, name: e.target.value })} />
            </div>
            <div>
              <label className="crm-label">Business name</label>
              <input className="crm-input" value={projectEditForm.business_name} onChange={(e) => setProjectEditForm({ ...projectEditForm, business_name: e.target.value })} placeholder="Which business this project is for" />
            </div>
            <div>
              <label className="crm-label">Notes</label>
              <textarea className="crm-input" rows={3} value={projectEditForm.notes} onChange={(e) => setProjectEditForm({ ...projectEditForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <button className="crm-btn crm-btn--ghost" onClick={() => setEditProject(null)}>Cancel</button>
            <button className="crm-btn crm-btn--primary" onClick={saveProjectEdit} disabled={savingProjectEdit}>
              {savingProjectEdit ? "Saving…" : "Save"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
