// Files & Portal tab (CRE-332 Phase 4) — the portal actions and the
// resources sheet AgentClientView already has, surfaced as their own tab
// instead of a header action (portal) / per-project-row sheet (resources).
import { useState } from "react";
import { FolderOpen } from "lucide-react";
import Card from "@/components/admin/cv/Card";
import EmptyState from "@/components/admin/cv/EmptyState";
import DarkEmbed from "@/components/admin/cv/DarkEmbed";
import ClientPortalActions from "@/components/admin/ClientPortalActions";
import ProjectResourcesSheet from "@/components/admin/ProjectResourcesSheet";
import type { ClientProjectRow } from "./useClientRecord";

export default function FilesPortalTab({
  clientId, projects,
}: { clientId: string; projects: ClientProjectRow[] }) {
  const [resourcesFor, setResourcesFor] = useState<ClientProjectRow | null>(null);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card className="cv-card-pad">
        <div className="cv-card-head"><span className="cv-card-title">Client portal</span></div>
        <p style={{ fontSize: 14, color: "var(--cv-muted)", margin: "-4px 0 14px" }}>
          Links, contract and sync actions for this client's portal.
        </p>
        {/* ClientPortalActions is dark-themed (.crm-shell) — see DarkEmbed. */}
        <DarkEmbed inline style={{ padding: 8 }}>
          <ClientPortalActions clientId={clientId} />
        </DarkEmbed>
      </Card>

      <Card className="cv-card-pad">
        <div className="cv-card-head"><span className="cv-card-title">Project files &amp; resources</span></div>
        {projects.length === 0 ? (
          <EmptyState icon={FolderOpen} title="No projects yet" />
        ) : (
          <div className="cv-simple-list">
            {projects.map((p) => (
              <div key={p.id} className="cv-simple-list__row">
                <span className="cv-simple-list__main">
                  <span className="cv-simple-list__title">{p.name}</span>
                </span>
                <button type="button" className="cv-sync-btn" onClick={() => setResourcesFor(p)}>
                  <FolderOpen size={13} /> Links, credentials &amp; files
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <ProjectResourcesSheet
        projectId={resourcesFor?.id ?? null}
        projectName={resourcesFor?.name}
        open={!!resourcesFor}
        onOpenChange={(v) => { if (!v) setResourcesFor(null); }}
      />
    </div>
  );
}
