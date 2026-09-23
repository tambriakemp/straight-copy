import { useEffect, useState } from "react";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import SocialTab from "@/components/admin/social/SocialTab";
import { supabase } from "@/integrations/supabase/client";

type Project = { id: string; name: string; business_name: string | null; client_id: string };

export default function Social() {
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