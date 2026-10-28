// One client, inside the agent shell.
//
// Bree: "When i click on a client, the next view should load within the agent
// screen like the client page." So this is not a link out — the roster and the
// client sit in the same column, and going back is a click rather than a
// browser history gamble. Asking Bria about a client and then reading that
// client's projects keeps the conversation alive beside it.
//
// Two tabs, and only two. Projects is the work; Info is who the work is for.
//
// CRE-803: both tabs used to open a side panel to edit in place — client
// contact info on Info, create/edit on Projects. Paperclip owns both records
// now, so neither panel exists any more; see the comment above the removed
// saveClient/saveProject for what each one did.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Eye, FolderOpen } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import ClientCompaniesCard from "@/components/admin/ClientCompaniesCard";
import ProjectResourcesSheet from "@/components/admin/ProjectResourcesSheet";
import { ReadOnlyNotice } from "@/components/admin/ReadOnlyNotice";

type Tab = "projects" | "info";

const TYPE_LABEL: Record<string, string> = {
  automation_build: "Automation",
  site_preview: "Preview",
  app_development: "App",
  web_development: "Web",
  marketing: "Marketing",
};

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
  clientId, onBack, headerExtra, hideFullPageLink = false, onOpenProject,
}: {
  clientId: string;
  onBack: () => void;
  /** Rendered in the header — the portal actions on the full page. */
  headerExtra?: React.ReactNode;
  /** The full page is already the full page. */
  hideFullPageLink?: boolean;
  /**
   * Open a project without leaving. Supplied by the agent panel, which keeps
   * its own stack; absent on the full page, where a project is a real route.
   */
  onOpenProject?: (projectId: string) => void;
}) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("projects");
  const [client, setClient] = useState<Client | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);

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

  // CRE-803: Paperclip is the source of truth for clients and client_projects
  // as of the CP-6 cutover, so the two side panels that used to hang off this
  // view — "Edit client" and "New/edit project" — are gone, and with them
  // saveClient and saveProject. They are kept as a comment, not deleted,
  // because reviving either means reviving exactly this shape, journey-node
  // seeding on project creation included:
  //
  //   const { error } = await supabase.from("clients").update({
  //     contact_name, contact_email, contact_phone,
  //   }).eq("id", client.id);
  //
  //   const { data: proj, error } = projectDraft.id
  //     ? await supabase.from("client_projects").update({ ...payload, status }).eq("id", projectDraft.id)
  //     : await supabase.from("client_projects").insert(payload).select("id").single();
  //   // + seed journey_nodes from journey_templates for a new automation_build project

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
          {/*
            The portal opener sits beside the name rather than with the other
            actions at the far right of the header. It is the one you reach for
            most — "what is this client actually seeing" — and .acv__head is
            space-between, so anything in headerExtra ends up at the opposite
            edge of a wide screen, far from the client it belongs to.
          */}
          <div className="acv__title-row">
            <h2 className="ws__work-title">{name}</h2>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    className="detail__portal-btn detail__portal-btn--ghost detail__portal-btn--icon acv__portal-link"
                    href={`/portal/${client.id}?as=admin`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${name}'s portal`}
                  >
                    <Eye size={15} strokeWidth={1.5} />
                  </a>
                </TooltipTrigger>
                <TooltipContent>View this client's portal</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
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
                <ReadOnlyNotice subject="project list" />
              </div>

              {/* A list, the same shape as the client roster — so moving between
                  the two does not mean learning a second layout. */}
              <ul className="plist">
                {projects.map((p) => (
                  <li key={p.id} className="plist__row">
                    <button
                      className="plist__main"
                      onClick={() => (onOpenProject
                        ? onOpenProject(p.id)
                        : navigate(`/admin/clients/${clientId}/projects/${p.id}`))}
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
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="acv__info">
              <div className="acv__bar">
                <span className="acv__bar-note">The person we deal with.</span>
                <ReadOnlyNotice subject="client" />
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
    </div>
  );
}
