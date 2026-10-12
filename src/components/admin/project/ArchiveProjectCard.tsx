// Archive a project, and bring one back.
//
// There was no way to do either. A finished project sat in the client's
// list forever beside the live ones, and the client's portal listed it
// as something still being worked on — the clients page has had an
// "Archived: … Show archived" row the whole time with no way to put
// anything into it.
//
// Archiving is reversible and says so. It is not a delete: the project,
// its tasks, its proposals and its invoices all stay exactly where they
// are, and the only thing that changes is where it is listed.
import { useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function ArchiveProjectCard({
  clientProjectId, projectName, status, onChanged,
}: {
  clientProjectId: string;
  projectName: string;
  status: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const archived = status === "archived";

  const set = async (next: "archived" | "active") => {
    setBusy(true);
    const { error } = await supabase.from("client_projects")
      .update({ status: next }).eq("id", clientProjectId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(next === "archived" ? "Project archived" : "Project is active again");
    onChanged();
  };

  return (
    <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <h2 className="cv-card-title">{archived ? "Archived" : "Archive this project"}</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--cv-muted)" }}>
          {archived
            ? `${projectName} is archived. It sits under "Show archived" on the client page and in their portal, and nothing has been deleted.`
            : "It moves under “Show archived” on the client page and in the client's portal. Nothing is deleted — the tasks, proposals and invoices all stay, and you can bring it back at any time."}
        </p>
      </div>
      <button
        type="button"
        className={`cv-open ${archived ? "cv-open--dark" : ""}`}
        style={{ alignSelf: "flex-start", padding: "0 20px" }}
        disabled={busy}
        onClick={() => {
          if (archived) { void set("active"); return; }
          if (confirm(`Archive ${projectName}? You can bring it back at any time.`)) void set("archived");
        }}
      >
        {archived
          ? <><ArchiveRestore size={15} style={{ marginRight: 7 }} /> {busy ? "…" : "Make it active again"}</>
          : <><Archive size={15} style={{ marginRight: 7 }} /> {busy ? "…" : "Archive project"}</>}
      </button>
    </section>
  );
}
