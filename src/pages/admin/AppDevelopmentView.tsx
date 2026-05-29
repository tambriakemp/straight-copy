import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import ProjectInvoicesCard from "@/components/admin/ProjectInvoicesCard";
import ProjectPreviewCard from "@/components/admin/ProjectPreviewCard";
import ProjectProposalsPanel from "@/components/admin/ProjectProposalsPanel";
import ProjectTasksPanel from "@/components/admin/tasks/ProjectTasksPanel";
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

export default function AppDevelopmentView() {
  const { id: clientId, projectId } = useParams<{ id: string; projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"proposals" | "schedule" | "preview">("proposals");

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

  if (loading) return <AdminLayout><div style={{ padding: 40, color: "var(--crm-taupe)" }}>Loading…</div></AdminLayout>;
  if (!project || !client) return <AdminLayout><div style={{ padding: 40 }}>Project not found.</div></AdminLayout>;

  return (
    <AdminLayout>
      <div className="roster">
        <Link to={`/admin/clients/${clientId}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--crm-taupe)", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 18 }}>
          <ArrowLeft size={14} /> Back to {client.business_name ?? "client"}
        </Link>

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

        <ProjectTabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-8">
          <ProjectTabsList>
            <ProjectTabsTrigger value="proposals">Proposals</ProjectTabsTrigger>
            <ProjectTabsTrigger value="schedule">Payment Schedule</ProjectTabsTrigger>
            <ProjectTabsTrigger value="preview">Preview</ProjectTabsTrigger>
          </ProjectTabsList>

          <ProjectTabsContent value="proposals">
            <ProjectProposalsPanel clientId={clientId!} clientProjectId={projectId!} portalUrl={portalUrl} />
          </ProjectTabsContent>

          <ProjectTabsContent value="schedule">
            <ProjectInvoicesCard clientId={clientId!} clientProjectId={projectId!} embedded />
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
        </ProjectTabs>
      </div>
    </AdminLayout>
  );
}
