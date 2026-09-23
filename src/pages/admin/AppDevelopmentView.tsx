import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import ProjectInvoicesCard from "@/components/admin/ProjectInvoicesCard";
import ProjectPreviewCard from "@/components/admin/ProjectPreviewCard";
import ProjectProposalsPanel from "@/components/admin/ProjectProposalsPanel";
import ContractAuditPanel from "@/components/admin/ContractAuditPanel";
import SocialTab from "@/components/admin/social/SocialTab";
import ProgressReportSettingsCard from "@/components/admin/ProgressReportSettingsCard";
import DeliveryTargetsCard from "@/components/admin/DeliveryTargetsCard";


import {
  ProjectTabs, ProjectTabsList, ProjectTabsTrigger, ProjectTabsContent,
} from "@/components/ProjectTabs";



const TYPE_LABEL: Record<string, string> = {
  app_development: "App Development",
  web_development: "Web Development",
  marketing: "Marketing",
};

type Project = { id: string; client_id: string; name: string; type: string };
type Client = { id: string; business_name: string | null; contact_name: string | null };

/**
 * @param embedded Render without AdminLayout, for the agent Workspace rail.
 *   Ids come from props there because the panel has no route of its own.
 */
export default function AppDevelopmentView({
  clientId: clientIdProp, projectId: projectIdProp, embedded = false, onBack,
}: {
  clientId?: string;
  projectId?: string;
  embedded?: boolean;
  onBack?: () => void;
} = {}) {
  const params = useParams<{ id: string; projectId: string }>();
  const clientId = clientIdProp ?? params.id;
  const projectId = projectIdProp ?? params.projectId;
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const isMarketing = project?.type === "marketing";
  // No per-project task board any more: every board is the same board, and
  // five copies of it behind five projects meant "what am I working on" had no
  // single answer. The whole board lives at /admin/tasks and in every agent's
  // Workspace rail, filterable by client.
  const [tab, setTab] = useState<"proposals" | "preview" | "social" | "settings">("proposals");



  const portalUrl = client?.id ? `${window.location.origin}/portal/${client.id}` : "";

  useEffect(() => {
    const load = async () => {
      if (!projectId || !clientId) return;
      setLoading(true);
      try {
        const [{ data: proj }, { data: c }] = await Promise.all([
          supabase.from("client_projects").select("id, client_id, name, type").eq("id", projectId).maybeSingle(),
          supabase.from("clients").select("id, business_name, contact_name").eq("id", clientId).maybeSingle(),
        ]);
        setProject(proj as Project | null);
        setClient(c as Client | null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [projectId, clientId]);

  // One wrapper, chosen once, so the loading and not-found returns agree with
  // the main one about whether this is a page or a panel.
  const Shell = ({ children }: { children: React.ReactNode }) =>
    embedded ? <>{children}</> : <AdminLayout>{children}</AdminLayout>;

  if (loading) return <Shell><div style={{ padding: 40, color: "var(--crm-taupe)" }}>Loading…</div></Shell>;
  if (!project || !client) return <Shell><div style={{ padding: 40 }}>Project not found.</div></Shell>;

  const backLabel = `Back to ${client.contact_name ?? client.business_name ?? "client"}`;

  return (
    <Shell>
      <div className={embedded ? undefined : "roster"}>
        {/* Embedded, going back is a step inside the panel — a Link would take
            the whole window somewhere the panel cannot follow. */}
        {embedded ? (
          <button className="acv__back" onClick={onBack}>
            <ArrowLeft size={13} /> {backLabel}
          </button>
        ) : (
          <Link to={`/admin/clients/${clientId}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--crm-taupe)", fontSize: 17, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 18 }}>
            <ArrowLeft size={14} /> {backLabel}
          </Link>
        )}

        {embedded ? (
          <header style={{ marginBottom: 6 }}>
            <div className="ws__work-eyebrow">{TYPE_LABEL[project.type] ?? "Project"}</div>
            <h2 className="ws__work-title">{project.name}</h2>
            <p className="ws__work-sub">
              {client.contact_name ?? client.business_name ?? "Client"}
            </p>
          </header>
        ) : (
          <div className="roster__head">
            <div className="roster__title-block">
              <div className="roster__eyebrow">{TYPE_LABEL[project.type] ?? "Project"}</div>
              <h1 className="roster__title">{project.name}</h1>
              <hr className="roster__rule" />
              <p className="roster__sub">
                Manage proposals, payment schedule, and the live preview for this project.
              </p>
            </div>
          </div>
        )}

        <ProjectTabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-8">
          <ProjectTabsList>
            {/* Proposals and the payment schedule were two tabs telling one
                story: what we quoted, and what of it has been billed and paid.
                Answering "has this client paid for what they signed" meant
                holding one tab in your head while reading the other. */}
            <ProjectTabsTrigger value="proposals">Proposals &amp; Payments</ProjectTabsTrigger>
            <ProjectTabsTrigger value="preview">Preview</ProjectTabsTrigger>
            {isMarketing && <ProjectTabsTrigger value="social">Social</ProjectTabsTrigger>}
            <ProjectTabsTrigger value="settings">Settings</ProjectTabsTrigger>
          </ProjectTabsList>

          <ProjectTabsContent value="proposals">
            <ProjectProposalsPanel clientId={clientId!} clientProjectId={projectId!} portalUrl={portalUrl} />

            <hr style={{
              border: 0, borderTop: "1px solid var(--crm-border-dark)", margin: "26px 0 22px",
            }} />

            <ProjectInvoicesCard clientId={clientId!} clientProjectId={projectId!} embedded />

            {/* The execution record for the signed agreement — the same story
                as the proposal it came from, so it sits under it rather than
                behind the task board it used to hide behind. */}
            {project.type === "web_development" && (
              <ContractAuditPanel clientId={clientId!} clientProjectId={projectId!} />
            )}
          </ProjectTabsContent>

          <ProjectTabsContent value="preview">
            <ProjectPreviewCard
              clientId={clientId!}
              clientProjectId={projectId!}
              projectName={project.name}
              clientLabel={client.business_name}
              embedded
            />
          </ProjectTabsContent>

          {isMarketing && (
            <ProjectTabsContent value="social">
              {/* SocialTab owns the whole workflow now, including the CoPost
                  credential and the autonomy gate. They used to sit in Settings,
                  a tab away from the thing they gate. */}
              <SocialTab clientProjectId={projectId!} />
            </ProjectTabsContent>
          )}

          <ProjectTabsContent value="settings">
            <DeliveryTargetsCard clientProjectId={projectId!} />
            <ProgressReportSettingsCard clientId={clientId!} clientProjectId={projectId!} />
          </ProjectTabsContent>
        </ProjectTabs>



      </div>
    </Shell>
  );
}
