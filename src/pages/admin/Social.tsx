import { useEffect, useState } from "react";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import PageHeader from "@/components/admin/cv/PageHeader";
import DarkEmbed from "@/components/admin/cv/DarkEmbed";
import EmptyState from "@/components/admin/cv/EmptyState";
import SocialTab from "@/components/admin/social/SocialTab";
import { Megaphone } from "lucide-react";
import { useNewAdminLayout } from "@/hooks/useNewAdminLayout";
import { supabase } from "@/integrations/supabase/client";

type Project = { id: string; name: string; business_name: string | null; client_id: string };

export default function Social() {
  const { enabled: newLayout } = useNewAdminLayout();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  useEffect(() => {
    supabase.from("client_projects").select("id, name, business_name, client_id").neq("status", "archived").order("name")
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        const rows = (data ?? []) as Project[];
        setProjects(rows);
        setProjectId((current) => current || rows[0]?.id || "");
      });
  }, []);

  if (!newLayout) {
    return <AdminLayout><div className="roster">
      <div className="roster__head"><div className="roster__title-block">
        <div className="roster__eyebrow">Client work</div><h1 className="roster__title">Social / <em>Marketing</em></h1>
        <hr className="roster__rule" /><p className="roster__sub">Review, approve, and publish social content by client project.</p>
      </div></div>
      <div className="ctbl__bar"><select className="ctbl__filter" value={projectId} onChange={(event) => setProjectId(event.target.value)} aria-label="Choose client project">
        {!projects.length && <option value="">No projects</option>}
        {projects.map((project) => <option key={project.id} value={project.id}>{project.business_name ? `${project.business_name} — ` : ""}{project.name}</option>)}
      </select></div>
      {projectId ? <SocialTab clientProjectId={projectId} /> : <div className="ctbl__empty">No client projects available.</div>}
    </div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="cv-admin" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <PageHeader
          eyebrow="Work / Marketing"
          title="Marketing"
          subtitle="Review, approve, and publish social content by client project. Prospecting lives on the Prospects page."
          right={
            <select
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              aria-label="Choose client project"
              style={{
                fontSize: 13, color: "var(--cv-body)", background: "var(--cv-card)",
                border: "1px solid var(--cv-border-strong)", borderRadius: "var(--cv-r-sm)",
                padding: "7px 10px", fontFamily: "var(--cv-font-sans)", minWidth: 220,
              }}
            >
              {!projects.length && <option value="">No projects</option>}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.business_name ? `${project.business_name} — ` : ""}{project.name}
                </option>
              ))}
            </select>
          }
        />
        <div style={{ padding: "0 32px 32px" }}>
          {projectId ? (
            // SocialTab is dark-themed (.crm-shell) — see DarkEmbed. The full
            // workflow (batches, review queue, publish autonomy) stays as-is;
            // only the page chrome around it is restyled for Phase 5.
            <DarkEmbed style={{ padding: 16, minHeight: 420 }}>
              <SocialTab clientProjectId={projectId} />
            </DarkEmbed>
          ) : (
            <EmptyState icon={Megaphone} title="No client projects available" />
          )}
        </div>
      </div>
    </AdminLayout>
  );
}