// Project & Tasks tab (CRE-332 Phase 4) — picks a project (a client with one
// project, the common case, needs no picker) and renders the existing task
// board for it unchanged.
import { useEffect, useState } from "react";
import { FolderKanban } from "lucide-react";
import EmptyState from "@/components/admin/cv/EmptyState";
import DarkEmbed from "@/components/admin/cv/DarkEmbed";
import ProjectTasksPanel from "@/components/admin/tasks/ProjectTasksPanel";
import type { ClientProjectRow } from "./useClientRecord";

export default function ProjectsTasksTab({ projects }: { projects: ClientProjectRow[] }) {
  const [selected, setSelected] = useState<string | null>(projects[0]?.id ?? null);

  useEffect(() => {
    if (!selected && projects.length) setSelected(projects[0].id);
  }, [projects, selected]);

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="No projects yet"
        subtitle="Tasks appear here once this client has a project."
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {projects.length > 1 && (
        <div className="cv-filter-tabs">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`cv-filter-tab${selected === p.id ? " cv-filter-tab--active" : ""}`}
              onClick={() => setSelected(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      {/* ProjectTasksPanel is dark-themed (.crm-shell) — see DarkEmbed. */}
      {selected && (
        <DarkEmbed style={{ padding: 16, minHeight: 500 }}>
          <ProjectTasksPanel clientProjectId={selected} />
        </DarkEmbed>
      )}
    </div>
  );
}
