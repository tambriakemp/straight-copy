// One client, inside the agent shell.
//
// Bree: "When i click on a client, the next view should load within the agent
// screen like the client page." So this is not a link out — the roster and the
// client sit in the same column, and going back is a click rather than a
// browser history gamble. Asking Bria about a client and then reading that
// client's projects keeps the conversation alive beside it.
//
// Two tabs, and only two. Projects is the work; Info is who the work is for.
// Everything editable opens a side panel rather than expanding in place, so the
// list you were reading does not move while you type in the middle of it.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, FolderOpen, Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import SidePanel from "@/components/admin/SidePanel";
import ClientCompaniesCard from "@/components/admin/ClientCompaniesCard";
import ProjectResourcesSheet from "@/components/admin/ProjectResourcesSheet";

type Tab = "projects" | "info";

const TYPE_LABEL: Record<string, string> = {
  automation_build: "Automation",
  site_preview: "Preview",
  app_development: "App",
  web_development: "Web",
  marketing: "Marketing",
};

const PROJECT_TYPES = [
  "automation_build", "app_development", "web_development", "marketing",
] as const;

interface Client {
  id: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  business_name: string | null;
  tier: string | null;
  created_at: string;
  archived: boolean;
}

interface Project {
  id: string;
  name: string;
  type: string;
  status: string;
  company_id: string | null;
  created_at: string;
}

interface CompanyOption { id: string; name: string; is_primary: boolean }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

export default function AgentClientView({
  clientId, onBack, headerExtra, hideFullPageLink = false,
}: {
  clientId: string;
  onBack: () => void;
  /** Rendered in the header — the portal actions on the full page. */
  headerExtra?: React.ReactNode;
  /** The full page is already the full page. */
  hideFullPageLink?: boolean;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("projects");
  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [editClient, setEditClient] = useState<null | {
    contact_name: string; contact_email: string; contact_phone: string;
  }>(null);
  const [projectDraft, setProjectDraft] = useState<null | {
    id: string | null; name: string; type: string; company_id: string; status: string;
  }>(null);
  const [saving, setSaving] = useState(false);
  // Links, credentials and files for one project. It used to hang off a project
  // tile; the tiles are gone, so it hangs off the row instead — dropping the
  // control would have made the resources unreachable rather than tidier.
  const [resourcesFor, setResourcesFor] = useState<Project | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, p, co] = await Promise.all([
      supabase.from("clients")
        .select("id, contact_name, contact_email, contact_phone, business_name, tier, created_at, archived")
        .eq("id", clientId).maybeSingle(),
      supabase.from("client_projects")
        .select("id, name, type, status, company_id, created_at")
        .eq("client_id", clientId).order("created_at", { ascending: false }),
      supabase.from("client_companies")
        .select("id, name, is_primary").eq("client_id", clientId).eq("archived", false)
        .order("is_primary", { ascending: false }).order("order_index", { ascending: true }),
    ]);
    if (c.error) toast.error(c.error.message);
    setClient((c.data ?? null) as Client | null);
    setProjects((p.data ?? []) as Project[]);
    setCompanies((co.data ?? []) as CompanyOption[]);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const companyName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of companies) m[c.id] = c.name;
    return m;
  }, [companies]);

  const saveClient = async () => {
    if (!editClient || !client) return;
    setSaving(true);
    const { error } = await supabase.from("clients").update({
      contact_name: editClient.contact_name.trim() || null,
      contact_email: editClient.contact_email.trim() || null,
      contact_phone: editClient.contact_phone.trim() || null,
    }).eq("id", client.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Client updated");
    setEditClient(null);
    await load();
  };

  const saveProject = async () => {
    if (!projectDraft) return;
    const name = projectDraft.name.trim();
    if (!name) return toast.error("A project needs a name.");
    setSaving(true);
    const payload = {
      client_id: clientId,
      name,
      type: projectDraft.type,
      company_id: projectDraft.company_id || null,
      // Written alongside company_id only while the readers still expect it.
      business_name: companyName[projectDraft.company_id] ?? null,
    };
    if (projectDraft.id) {
      const { error } = await supabase.from("client_projects")
        .update({ ...payload, status: projectDraft.status }).eq("id", projectDraft.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Project updated");
      setProjectDraft(null);
      return void load();
    }

    const { data: proj, error } = await supabase.from("client_projects")
      .insert(payload).select("id").single();
    if (error || !proj) {
      setSaving(false);
      return toast.error(error?.message ?? "Could not create the project");
    }

    // An automation build without its journey nodes is an empty checklist that
    // looks finished. The templates are seeded here for the same reason the old
    // form did it — the project is useless until they exist, and nothing else
    // creates them.
    if (projectDraft.type === "automation_build") {
      const { data: tpls } = await supabase
        .from("journey_templates")
        .select("id, key, label, order_index, checklist")
        .eq("tier", client?.tier ?? "launch")
        .order("order_index");
      if (tpls?.length) {
        const { error: jErr } = await supabase.from("journey_nodes").insert(
          tpls.map((t) => ({
            client_id: clientId,
            client_project_id: proj.id,
            template_id: t.id,
            key: t.key,
            label: t.label,
            order_index: t.order_index,
            checklist: t.checklist,
          })),
        );
        // Loud rather than silent: the project exists but is missing its spine,
        // and finding that out later looks like the checklist was never set up.
        if (jErr) toast.error(`Project created, but its checklist failed: ${jErr.message}`);
      }
    }

    setSaving(false);
    toast.success("Project created");
    setProjectDraft(null);
    navigate(`/admin/clients/${clientId}/projects/${proj.id}`);
  };

  if (loading) return <p className="ws__work-sub">Loading…</p>;
  if (!client) return <p className="ws__work-sub">Client not found.</p>;

  const name = client.contact_name || client.business_name || "Untitled";

  return (
    <div className="acv">
      <button className="acv__back" onClick={onBack}>
        <ArrowLeft size={13} /> All clients
      </button>

      <header className="acv__head">
        <div style={{ minWidth: 0 }}>
          <div className="ws__work-eyebrow">Client</div>
          <h2 className="ws__work-title">{name}</h2>
          <p className="ws__work-sub">
            {client.contact_email || "no email"}
            {client.contact_phone ? ` · ${client.contact_phone}` : ""}
          </p>
        </div>
        {headerExtra}
        {!hideFullPageLink && (
          <button
            className="crm-btn crm-btn--ghost crm-btn--sm"
            onClick={() => navigate(`/admin/clients/${client.id}`)}
            title="Open the full client page"
          >
            <ExternalLink size={12} /> Full page
          </button>
        )}
      </header>

      <div className="cdet">
        <div className="cdet__main">
          <div className="cdet__tabs" role="tablist">
            <button
              className={`cdet__tab${tab === "projects" ? " is-on" : ""}`}
              role="tab" aria-selected={tab === "projects"}
              onClick={() => setTab("projects")}
            >
              Projects <span className="cdet__tab-count">{projects.length}</span>
            </button>
            <button
              className={`cdet__tab${tab === "info" ? " is-on" : ""}`}
              role="tab" aria-selected={tab === "info"}
              onClick={() => setTab("info")}
            >
              Info
            </button>
          </div>

          {tab === "projects" ? (
            <>
              <div className="acv__bar">
                <span className="acv__bar-note">
                  {projects.length === 0 ? "No projects yet." : "Open one to see its work."}
                </span>
                <button
                  className="crm-btn crm-btn--primary crm-btn--sm"
                  onClick={() => setProjectDraft({
                    id: null, name: "", type: "automation_build",
                    company_id: companies.find((c) => c.is_primary)?.id ?? "",
                    status: "active",
                  })}
                >
                  <Plus size={12} /> New project
                </button>
              </div>

              {/* A list, the same shape as the client roster — so moving between
                  the two does not mean learning a second layout. */}
              <ul className="plist">
                {projects.map((p) => (
                  <li key={p.id} className="plist__row">
                    <button
                      className="plist__main"
                      onClick={() => navigate(`/admin/clients/${clientId}/projects/${p.id}`)}
                    >
                      <span className="plist__name">{p.name}</span>
                      <span className="plist__meta">
                        {TYPE_LABEL[p.type] ?? p.type}
                        {p.company_id && companyName[p.company_id]
                          ? ` · ${companyName[p.company_id]}`
                          : ""}
                      </span>
                    </button>
                    <span className="plist__when">{fmtDate(p.created_at)}</span>
                    <span className={`plist__status${p.status === "complete" ? " is-done" : ""}`}>
                      {p.status}
                    </span>
                    <button
                      className="plist__edit"
                      title="Links, credentials and files"
                      aria-label={`Resources for ${p.name}`}
                      onClick={() => setResourcesFor(p)}
                    >
                      <FolderOpen size={12} />
                    </button>
                    <button
                      className="plist__edit"
                      title="Edit this project"
                      aria-label={`Edit ${p.name}`}
                      onClick={() => setProjectDraft({
                        id: p.id, name: p.name, type: p.type,
                        company_id: p.company_id ?? "", status: p.status,
                      })}
                    >
                      <Pencil size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="acv__info">
              <div className="acv__bar">
                <span className="acv__bar-note">The person we deal with.</span>
                <button
                  className="crm-btn crm-btn--ghost crm-btn--sm"
                  onClick={() => setEditClient({
                    contact_name: client.contact_name ?? "",
                    contact_email: client.contact_email ?? "",
                    contact_phone: client.contact_phone ?? "",
                  })}
                >
                  <Pencil size={12} /> Edit
                </button>
              </div>
              <dl className="acv__dl">
                <dt>Name</dt><dd>{client.contact_name || "—"}</dd>
                <dt>Email</dt><dd>{client.contact_email || "—"}</dd>
                <dt>Phone</dt><dd>{client.contact_phone || "—"}</dd>
                <dt>Status</dt><dd>{client.archived ? "Inactive" : "Active"}</dd>
                <dt>Client since</dt><dd>{fmtDate(client.created_at)}</dd>
              </dl>
            </div>
          )}
        </div>

        <aside className="cdet__side">
          <ClientCompaniesCard clientId={clientId} />
        </aside>
      </div>

      <ProjectResourcesSheet
        projectId={resourcesFor?.id ?? null}
        projectName={resourcesFor?.name}
        open={!!resourcesFor}
        onOpenChange={(v) => { if (!v) setResourcesFor(null); }}
      />

      <SidePanel
        open={!!editClient}
        title="Edit client"
        subtitle="Businesses are managed under Companies."
        onClose={() => setEditClient(null)}
        footer={
          <>
            <button className="crm-btn crm-btn--ghost" onClick={() => setEditClient(null)} disabled={saving}>Cancel</button>
            <button className="crm-btn crm-btn--primary" onClick={() => void saveClient()} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </>
        }
      >
        {editClient && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="crm-label">Client name</label>
              <input className="crm-input" value={editClient.contact_name} autoFocus
                onChange={(e) => setEditClient({ ...editClient, contact_name: e.target.value })} />
            </div>
            <div>
              <label className="crm-label">Email</label>
              <input className="crm-input" type="email" value={editClient.contact_email}
                onChange={(e) => setEditClient({ ...editClient, contact_email: e.target.value })} />
            </div>
            <div>
              <label className="crm-label">Phone</label>
              <input className="crm-input" value={editClient.contact_phone}
                onChange={(e) => setEditClient({ ...editClient, contact_phone: e.target.value })} />
            </div>
          </div>
        )}
      </SidePanel>

      <SidePanel
        open={!!projectDraft}
        title={projectDraft?.id ? "Edit project" : "New project"}
        onClose={() => setProjectDraft(null)}
        footer={
          <>
            <button className="crm-btn crm-btn--ghost" onClick={() => setProjectDraft(null)} disabled={saving}>Cancel</button>
            <button className="crm-btn crm-btn--primary" onClick={() => void saveProject()} disabled={saving}>
              {saving ? "Saving…" : projectDraft?.id ? "Save changes" : "Create project"}
            </button>
          </>
        }
      >
        {projectDraft && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label className="crm-label">Project name *</label>
              <input className="crm-input" value={projectDraft.name} autoFocus
                onChange={(e) => setProjectDraft({ ...projectDraft, name: e.target.value })} />
            </div>
            <div>
              <label className="crm-label">Type</label>
              <select className="crm-input" value={projectDraft.type}
                onChange={(e) => setProjectDraft({ ...projectDraft, type: e.target.value })}>
                {PROJECT_TYPES.map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="crm-label">Company</label>
              {companies.length === 0 ? (
                <p style={{ fontSize: 15, color: "var(--crm-taupe)", margin: "4px 0 0" }}>
                  No companies yet — add one first, on the right.
                </p>
              ) : (
                <select className="crm-input" value={projectDraft.company_id}
                  onChange={(e) => setProjectDraft({ ...projectDraft, company_id: e.target.value })}>
                  <option value="">— not assigned —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.is_primary ? " (primary)" : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {projectDraft.id && (
              <div>
                <label className="crm-label">Status</label>
                <select className="crm-input" value={projectDraft.status}
                  onChange={(e) => setProjectDraft({ ...projectDraft, status: e.target.value })}>
                  {["active", "paused", "complete", "archived"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
      </SidePanel>
    </div>
  );
}
