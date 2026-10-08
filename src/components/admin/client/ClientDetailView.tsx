// The new 6-tab client detail page (CRE-332 Phase 4) — Overview, Intake,
// Proposals, Payments, Project & Tasks, Files & Portal. Rendered by
// ClientDetail.tsx only when useNewAdminLayout() is on; the old page
// (AgentClientView, unchanged) stays the default.
import { useState } from "react";
import { Eye } from "lucide-react";
import PageHeader from "@/components/admin/cv/PageHeader";
import StatusChip from "@/components/admin/cv/StatusChip";
import DarkEmbed from "@/components/admin/cv/DarkEmbed";
import ClientPortalActions from "@/components/admin/ClientPortalActions";
import { useClientRecord } from "./useClientRecord";
import OverviewTab from "./OverviewTab";
import IntakeTab from "./IntakeTab";
import ProposalsTab from "./ProposalsTab";
import PaymentsTab from "./PaymentsTab";
import ProjectsTasksTab from "./ProjectsTasksTab";
import FilesPortalTab from "./FilesPortalTab";

type Tab = "overview" | "intake" | "proposals" | "payments" | "project" | "files";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "intake", label: "Intake" },
  { key: "proposals", label: "Proposals" },
  { key: "payments", label: "Payments" },
  { key: "project", label: "Project & Tasks" },
  { key: "files", label: "Files & Portal" },
];

export default function ClientDetailView({ clientId }: { clientId: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const { client, projects, loading } = useClientRecord(clientId);

  const name = client?.contact_name || client?.business_name || "Untitled";

  return (
    <div className="cv-admin" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      <PageHeader
        eyebrow="Client"
        title={loading ? "Loading…" : name}
        subtitle={
          client
            ? [client.contact_email, client.contact_phone].filter(Boolean).join(" · ") || "No contact info on file"
            : undefined
        }
        right={
          client && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <StatusChip label={client.archived ? "Inactive" : "Active"} tone={client.archived ? "gray" : "green"} />
              <a className="cv-sync-btn" href={`/portal/${clientId}?as=admin`} target="_blank" rel="noreferrer">
                <Eye size={13} /> Portal
              </a>
              {/* ClientPortalActions is dark-themed (.crm-shell) — see DarkEmbed. */}
              <DarkEmbed inline style={{ padding: 4 }}>
                <ClientPortalActions clientId={clientId} />
              </DarkEmbed>
            </div>
          )
        }
      />

      <div style={{ padding: "0 32px 32px" }}>
        <div className="cv-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`cv-tab${tab === t.key ? " cv-tab--active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key === "project" && projects.length > 0 && (
                <span className="cv-tab-count">{projects.length}</span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: 24, color: "var(--cv-muted)" }}>Loading…</div>
        ) : !client ? (
          <div style={{ padding: 24, color: "var(--cv-muted)" }}>Client not found.</div>
        ) : (
          <>
            {tab === "overview" && <OverviewTab client={client} projects={projects} />}
            {tab === "intake" && <IntakeTab clientId={clientId} />}
            {tab === "proposals" && <ProposalsTab clientId={clientId} projects={projects} />}
            {tab === "payments" && <PaymentsTab clientId={clientId} projects={projects} />}
            {tab === "project" && <ProjectsTasksTab projects={projects} />}
            {tab === "files" && <FilesPortalTab clientId={clientId} projects={projects} />}
          </>
        )}
      </div>
    </div>
  );
}
