// The project page.
//
// Was six tabs — Tasks, Proposals, Payment Schedule, Preview, Social,
// Settings — which meant the answer to "where is this project up to" was
// spread across six screens and nobody could see two of them at once. Tasks
// went to the one board at /admin/tasks; the rest is now one page, in the
// order the work actually reads: what the client is looking at, what we quoted,
// and what has been paid.
//
// Laid out to the Cre8 Visions design canvas — tokens in
// components/admin/project/projectPageTokens.ts, panel chrome in PanelChrome.
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import SidePanel from "@/components/admin/SidePanel";
import ProjectInvoicesCard from "@/components/admin/ProjectInvoicesCard";
import ProjectProposalsPanel from "@/components/admin/ProjectProposalsPanel";
import ContractAuditPanel from "@/components/admin/ContractAuditPanel";
import SocialTab from "@/components/admin/social/SocialTab";
import ProgressReportSettingsCard from "@/components/admin/ProgressReportSettingsCard";
import DeliveryTargetsCard from "@/components/admin/DeliveryTargetsCard";
import ProjectPageHeader from "@/components/admin/project/ProjectPageHeader";
import ProjectPreviewPanel from "@/components/admin/project/ProjectPreviewPanel";
import { T } from "@/components/admin/project/projectPageTokens";

const TYPE_LABEL: Record<string, string> = {
  app_development: "App Development",
  web_development: "Web Development",
  marketing: "Marketing",
};

type Project = {
  id: string; client_id: string; name: string; type: string; status: string;
};
type Client = {
  id: string; business_name: string | null; contact_name: string | null;
  contact_email: string | null;
};

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
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isMarketing = project?.type === "marketing";
  const portalUrl = clientId ? `${window.location.origin}/portal/${clientId}` : "";

  useEffect(() => {
    const load = async () => {
      if (!projectId || !clientId) return;
      setLoading(true);
      try {
        const [{ data: proj }, { data: c }] = await Promise.all([
          supabase.from("client_projects")
            .select("id, client_id, name, type, status").eq("id", projectId).maybeSingle(),
          supabase.from("clients")
            .select("id, business_name, contact_name, contact_email").eq("id", clientId).maybeSingle(),
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

  if (loading) return <Shell><div style={{ padding: 40, color: T.muted }}>Loading…</div></Shell>;
  if (!project || !client) return <Shell><div style={{ padding: 40, color: T.text }}>Project not found.</div></Shell>;

  const clientName = client.contact_name ?? client.business_name ?? "Client";

  return (
    <Shell>
      {/* Two boxes, and both do a job.

          The outer one scrolls. .crm-page is `overflow: hidden`, so a page that
          does not bring its own scroller simply loses everything past the fold
          — which is what .roster was quietly providing before this page stopped
          using it. Full width, so the scrollbar sits at the window edge.

          The inner one centres and caps. width:100% on it is load-bearing, not
          belt-and-braces: an auto margin on a flex column's cross axis cancels
          the default stretch, so without it this box shrinks to fit its own
          content (measured: 500px inside a 1024px page) and the auto-fit grid
          below then has room for only one column. The narrow ribbon and the
          stacked panels were one cause, not two. */}
      <div style={embedded ? undefined : { flex: 1, minHeight: 0, overflowY: "auto" }}>
      <div style={{
        padding: embedded ? "0 0 32px" : "28px 40px 48px",
        maxWidth: 1320, margin: "0 auto", width: "100%", boxSizing: "border-box",
      }}>
        <ProjectPageHeader
          typeLabel={TYPE_LABEL[project.type] ?? "Project"}
          name={project.name}
          clientName={clientName}
          clientEmail={client.contact_email}
          status={project.status}
          backLabel={clientName}
          // Embedded, going back is a step inside the panel — navigating would
          // take the whole window somewhere the panel cannot follow.
          onBack={() => (embedded && onBack ? onBack() : navigate(`/admin/clients/${clientId}`))}
          onSettings={() => setSettingsOpen(true)}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <ProjectPreviewPanel
            clientId={clientId!}
            clientProjectId={projectId!}
            projectName={project.name}
            clientLabel={client.business_name}
          />

          {/* Side by side, because the question they answer together — has this
              client paid for what they signed — needs both in one glance. They
              stack below 900px rather than squeezing to half a column each. */}
          <div style={{
            display: "grid", gap: 18,
            gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
            alignItems: "start",
          }}>
            <ProjectProposalsPanel
              clientId={clientId!} clientProjectId={projectId!} portalUrl={portalUrl}
            />
            <ProjectInvoicesCard clientId={clientId!} clientProjectId={projectId!} />
          </div>

          {isMarketing && <SocialTab clientProjectId={projectId!} />}

          {project.type === "web_development" && (
            <ContractAuditPanel clientId={clientId!} clientProjectId={projectId!} />
          )}
        </div>

        {/* Settings were a tab you visited once per project and then never
            again. Behind the gear, like the rest of the admin. */}
        <SidePanel
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          title="Project settings"
          subtitle={project.name}
          width={520}
        >
          <DeliveryTargetsCard clientProjectId={projectId!} />
          <ProgressReportSettingsCard clientId={clientId!} clientProjectId={projectId!} />
        </SidePanel>
      </div>
      </div>
    </Shell>
  );
}
