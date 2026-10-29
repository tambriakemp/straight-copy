// The project chooser, drawn in the redesigned `.cp` system.
//
// A client with more than one live project used to be redirected from
// Project and Files to the old light `/projects` page (`Portal.tsx`), which
// is why both screens "still showed the old layout" for them. This lists the
// projects inside the new shell instead; each row opens the redesigned
// screen for that project via `/project/:projectId` or `/files/:projectId`.

import { Link, useLocation } from "react-router-dom";
import { whenWord } from "@/lib/clientPortalApi";
import type { ResolvedProjectRow } from "@/components/portal/useClientPortal";

export default function ProjectChooser({
  clientId,
  projects,
  target,
}: {
  clientId: string;
  projects: ResolvedProjectRow[];
  target: "project" | "files";
}) {
  const { search } = useLocation();
  // Keep `?as=admin` (and nothing else matters here) across the click.
  const keep = search.includes("as=admin") ? search : "";
  return (
    <>
      <div>
        <h1 className="cp-h1">{target === "files" ? "Files" : "Your projects"}</h1>
        <p className="cp-sub">
          {target === "files" ? "Choose a project to see its files." : "Choose a project to open."}
        </p>
      </div>
      <section className="cp-card cp-projects">
        <ul className="cp-projects__list">
          {projects.map((project) => (
            <li key={project.id} className="cp-projects__row">
              <span className="cp-projects__text">
                <span className="cp-projects__name">{project.name}</span>
                {project.updated_at && (
                  <span className="cp-projects__meta">updated {whenWord(project.updated_at)}</span>
                )}
              </span>
              <Link className="cp__btn" to={`/portal/${clientId}/${target}/${project.id}${keep}`}>
                Open
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
