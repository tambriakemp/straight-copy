// Overview tab — today's "Info" + "Projects" tabs from AgentClientView,
// collapsed into one glance view (CRE-332 Phase 4).
import { FolderKanban } from "lucide-react";
import Card from "@/components/admin/cv/Card";
import EmptyState from "@/components/admin/cv/EmptyState";
import StatusChip from "@/components/admin/cv/StatusChip";
import type { ClientRecord, ClientProjectRow } from "./useClientRecord";

const TYPE_LABEL: Record<string, string> = {
  automation_build: "Automation",
  site_preview: "Preview",
  app_development: "App",
  web_development: "Web",
  marketing: "Marketing",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function projectTone(status: string) {
  if (status === "complete") return "green" as const;
  if (status === "paused" || status === "archived") return "gray" as const;
  return "blue" as const;
}

export default function OverviewTab({
  client, projects,
}: { client: ClientRecord; projects: ClientProjectRow[] }) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card className="cv-card-pad">
        <div className="cv-card-head"><span className="cv-card-title">Client</span></div>
        <dl className="cv-dl">
          <dt>Name</dt><dd>{client.contact_name || "—"}</dd>
          <dt>Business</dt><dd>{client.business_name || "—"}</dd>
          <dt>Email</dt><dd>{client.contact_email || "—"}</dd>
          <dt>Phone</dt><dd>{client.contact_phone || "—"}</dd>
          <dt>Status</dt>
          <dd><StatusChip label={client.archived ? "Inactive" : "Active"} tone={client.archived ? "gray" : "green"} /></dd>
          <dt>Client since</dt><dd>{fmtDate(client.created_at)}</dd>
        </dl>
      </Card>

      <Card className="cv-card-pad">
        <div className="cv-card-head">
          <span className="cv-card-title">Projects</span>
          <span className="cv-card-sub">{projects.length}</span>
        </div>
        {projects.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No projects yet" />
        ) : (
          <div className="cv-simple-list">
            {projects.map((p) => (
              <div key={p.id} className="cv-simple-list__row">
                <span className="cv-simple-list__main">
                  <span className="cv-simple-list__title">{p.name}</span>
                  <span className="cv-simple-list__sub">
                    {TYPE_LABEL[p.type] ?? p.type}{p.business_name ? ` · ${p.business_name}` : ""}
                  </span>
                </span>
                <span className="cv-simple-list__when">{fmtDate(p.created_at)}</span>
                <StatusChip label={p.status} tone={projectTone(p.status)} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
