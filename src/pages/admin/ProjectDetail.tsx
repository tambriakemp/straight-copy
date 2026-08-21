import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import AutomationBuildView from "./AutomationBuildView";
import PreviewDetail from "./PreviewDetail";
import AppDevelopmentView from "./AppDevelopmentView";

type ProjectRow = { id: string; client_id: string; type: string; name: string };

/**
 * One project, dispatched by type.
 *
 * @param embedded Render without AdminLayout, for the agent Workspace rail.
 *   Ids come from props there because the panel has no route of its own.
 */
export default function ProjectDetail({
  clientId: clientIdProp, projectId: projectIdProp, embedded = false, onBack,
}: {
  clientId?: string;
  projectId?: string;
  embedded?: boolean;
  onBack?: () => void;
} = {}) {
  const params = useParams<{ id: string; projectId: string }>();
  const projectId = projectIdProp ?? params.projectId;
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("client_projects")
        .select("id, client_id, type, name")
        .eq("id", projectId)
        .maybeSingle();
      if (cancelled) return;
      if (!data) { setNotFound(true); setLoading(false); return; }
      setProject(data as ProjectRow);
      if (data.type === "site_preview") {
        const { data: pp } = await supabase
          .from("preview_projects")
          .select("id")
          .eq("client_project_id", data.id)
          .maybeSingle();
        setPreviewId(pp?.id ?? null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const Shell = ({ children }: { children: React.ReactNode }) =>
    embedded ? <>{children}</> : <AdminLayout>{children}</AdminLayout>;

  if (loading) {
    return <Shell><div style={{ padding: 40, color: "var(--crm-taupe)" }}>Loading project…</div></Shell>;
  }
  if (notFound || !project) {
    // Embedded there is nowhere to redirect to — the panel says so instead.
    if (embedded) return <div style={{ padding: 40 }}>Project not found.</div>;
    return <Navigate to="/admin" replace />;
  }

  const clientId = clientIdProp ?? project.client_id;
  const pass = { clientId, projectId, embedded, onBack };

  if (project.type === "automation_build") return <AutomationBuildView {...pass} />;

  if (project.type === "site_preview") {
    if (!previewId) {
      return <Shell><div style={{ padding: 40 }}>No preview attached to this project yet.</div></Shell>;
    }
    return (
      <PreviewDetail
        overrideId={previewId}
        backTo={`/admin/clients/${clientId}`}
        embedded={embedded}
      />
    );
  }

  if (project.type === "app_development" || project.type === "web_development"
    || project.type === "marketing") {
    return <AppDevelopmentView {...pass} />;
  }

  if (embedded) return <div style={{ padding: 40 }}>Unknown project type.</div>;
  return <Navigate to={`/admin/clients/${clientId}`} replace />;
}
