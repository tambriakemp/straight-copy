// Archive a project, and bring one back.
//
// CRE-803: Paperclip is the source of truth for client_projects as of the
// CP-6 cutover, so this no longer updates its `status`. The update is kept
// as a comment rather than deleted, because reviving this means reviving
// exactly this shape:
//
//   await supabase.from("client_projects")
//     .update({ status: next }).eq("id", clientProjectId);
//
// There was no way to archive a project before this existed, and now there
// is no way to from here — both facts worth knowing if someone goes looking
// for "Show archived" on the client page and wonders how anything got there.
import { ReadOnlyNotice } from "@/components/admin/ReadOnlyNotice";

export default function ArchiveProjectCard({
  projectName,
  status,
}: {
  clientProjectId?: string;
  projectName: string;
  status: string;
  onChanged?: () => void;
}) {
  const archived = status === "archived";
  return (
    <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <h2 className="cv-card-title">{archived ? "Archived" : "Archive this project"}</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--cv-muted)" }}>
          {archived
            ? `${projectName} is archived.`
            : `${projectName} is active.`}
        </p>
      </div>
      <ReadOnlyNotice subject="project's archive state" />
    </section>
  );
}
