import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import AutomationBuildView from "./AutomationBuildView";
import PreviewDetail from "./PreviewDetail";
import AppDevelopmentView from "./AppDevelopmentView";

type ProjectRow = { id: string; client_id: string; type: string; name: string };

export default function ProjectDetail() {
  const { projectId } = useParams<{ id: string; projectId: string }>();
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

  if (loading) return <AdminLayout><div style={{ padding: 40, color: "var(--crm-taupe)" }}>Loading project…</div></AdminLayout>;
  if (notFound || !project) return <Navigate to="/admin" replace />;

  if (project.type === "automation_build") {
    return <AutomationBuildView />;
  }
  if (project.type === "site_preview") {
    if (!previewId) return <AdminLayout><div style={{ padding: 40 }}>No preview attached to this project yet.</div></AdminLayout>;
    return <PreviewDetail overrideId={previewId} backTo={`/admin/clients/${project.client_id}`} />;
  }
  if (project.type === "app_development") {
    return <AppDevelopmentView />;
  }
  return <Navigate to={`/admin/clients/${project.client_id}`} replace />;
}
