// The project page, laid out to the Admin Journeys canvas.
//
// It was six tabs, then one long scroll of panels, and now it is a page
// with a shape: four figures that say where the project is, then one tab
// per thing you might have come to do. The scroll was better than the tabs
// — you could see two panels at once — but it also meant the preview, the
// proposal, the payment schedule and the social queue all loaded whether
// you wanted them or not, and the answer to "where is this up to" was
// somewhere in the middle of it.
//
// What is NOT here, on purpose: a task board. Tasks live on the Paperclip
// board and are read from it; this page shows the counts, the two lists
// that are waiting on a person, and a link out. Bree's call — the admin
// does not keep a second board.
//
// Intake moved here from the client page, along with Proposals, Payments
// and Files. All four describe a project; a client only has them in the
// sense that one of their projects does.
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ExternalLink, Settings } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import SidePanel from "@/components/admin/SidePanel";
import EmptyState from "@/components/admin/cv/EmptyState";
import ProjectInvoicesCard from "@/components/admin/ProjectInvoicesCard";
import ProjectProposals from "@/components/admin/proposal/ProjectProposals";
import ContractAuditPanel from "@/components/admin/ContractAuditPanel";
import SocialTab from "@/components/admin/social/SocialTab";
import ProgressReportSettingsCard from "@/components/admin/ProgressReportSettingsCard";
import DeliveryTargetsCard from "@/components/admin/DeliveryTargetsCard";
import ProjectSecretsPanel from "@/components/admin/ProjectSecretsPanel";
import ArchiveProjectCard from "@/components/admin/project/ArchiveProjectCard";
import ProjectFilesPanel from "@/components/admin/project/ProjectFilesPanel";
import ProjectNotesTab from "@/components/admin/project/ProjectNotesTab";
import IntakeTab from "@/components/admin/client/IntakeTab";
import { useProjectRecord, type ProjectTask } from "@/components/admin/project/useProjectRecord";
import { projectTypeStyle } from "@/lib/projectType";
import { headingFor } from "@/lib/clientRows";
import { boardUrlFor } from "@/lib/issueLinks";
import { PROJECT_PHASES, phaseStateAt } from "@/lib/projectPhases";

type Tab = "overview" | "intake" | "proposals" | "payments" | "files" | "notes" | "social";

function Stat({ label, value, dark = false }: { label: string; value: number; dark?: boolean }) {
  return (
    <div className={`cv-card cv-stat ${dark ? "cv-stat--dark" : ""}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function TaskList({ tasks, dot, limit = 4 }: { tasks: ProjectTask[]; dot: string; limit?: number }) {
  return (
    <>
      {tasks.slice(0, limit).map((t) => (
        <div key={t.id} className="cv-task"><i style={{ background: dot }} />{t.name}</div>
      ))}
    </>
  );
}

export default function AppDevelopmentView({
  clientId: clientIdProp, projectId: projectIdProp, embedded = false, onBack,
}: {
  clientId?: string;
  projectId?: string;
  embedded?: boolean;
  onBack?: () => void;
} = {}) {
  const params = useParams<{ id: string; projectId: string }>();
  const projectId = projectIdProp ?? params.projectId;
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const {
    project, client, counts, needsReview, blocked, links, notes, loading, notFound, reload,
  } = useProjectRecord(projectId);

  const clientId = clientIdProp ?? project?.client_id;
  const boardUrl = useMemo(() => boardUrlFor(links), [links]);

  const Shell = ({ children }: { children: React.ReactNode }) =>
    embedded ? <>{children}</> : <AdminLayout topBar={false}>{children}</AdminLayout>;

  if (loading) {
    return <Shell><div className="cv-admin cv-page"><p className="cv-page-sub">Loading project…</p></div></Shell>;
  }
  if (notFound || !project || !clientId) {
    return (
      <Shell>
        <div className="cv-admin cv-page">
          <EmptyState title="Project not found" subtitle="It may have been deleted." />
        </div>
      </Shell>
    );
  }

  const type = projectTypeStyle(project.type);
  // The person, then the business — the same order headingFor uses on
  // the clients list. The breadcrumb was leading with business_name, so
  // a crumb reading "Menovia" above a project called "Menovia.ai" said
  // the same word twice and named nobody.
  const clientName = headingFor({
    contact_name: client?.contact_name ?? null,
    business_name: client?.business_name ?? null,
  });
  const isMarketing = project.type === "marketing";
  const portalUrl = `${window.location.origin}/portal/${clientId}`;

  const TABS: Array<{ key: Tab; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "intake", label: "Intake" },
    { key: "proposals", label: "Proposals" },
    { key: "payments", label: "Payments" },
    { key: "files", label: "Files" },
    { key: "notes", label: "Notes" },
    ...(isMarketing ? [{ key: "social" as const, label: "Social" }] : []),
  ];

  // The phase strip is the canvas's own placeholder, pill and all: there is
  // no phase schema yet, and the five below are the same five it draws.
  // Labelled "Sample phases" on the card, because an unlabelled guess about
  // where a project has got to is worse than no guess.
  const phaseIndex = PROJECT_PHASES.length > 0 ? phaseStateAt(counts.pct) : 0;

  return (
    <Shell>
      <div className="cv-admin cv-page" style={embedded ? undefined : { flex: 1, minHeight: 0, overflow: "auto" }}>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 14 }}>
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            <div className="cv-crumbs">
              <a href="/admin/clients">All clients</a>
              {" / "}
              <a
                href={`/admin/clients/${clientId}`}
                onClick={(e) => {
                  // Embedded, going back is a step inside the panel —
                  // navigating takes the whole window where it cannot follow.
                  if (embedded && onBack) { e.preventDefault(); onBack(); }
                }}
              >
                {clientName}
              </a>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
              <h1 className="cv-page-title">{project.name}</h1>
              <span className="cv-chip" style={{ background: type.bg, color: type.fg }}>{type.label}</span>
              <span className={`cv-chip cv-chip--${project.status === "archived" ? "gray" : "green"}`}>
                {project.status === "archived" ? "Archived" : "Active"}
              </span>
            </div>
          </div>
          <a className="cv-open cv-open--dark" style={{ padding: "0 18px" }} href={boardUrl} target="_blank" rel="noreferrer">
            Open agent board <ExternalLink size={15} style={{ marginLeft: 7 }} />
          </a>
          <button type="button" className="cv-open" style={{ padding: "0 18px" }} onClick={() => setSettingsOpen(true)}>
            <Settings size={15} style={{ marginRight: 7 }} /> Settings
          </button>
        </div>

        <div className="cv-stat-row cv-stat-row--tight">
          <Stat dark label="Tasks done" value={counts.done} />
          <Stat label="Open tasks" value={counts.open} />
          <Stat label="Blocked" value={counts.blocked} />
          <Stat label="Needs your review" value={counts.needsReview} />
        </div>

        <div className="cv-tabrow">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`cv-tabpill ${tab === t.key ? "cv-tabpill--on" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
          {/* The board is a page of this admin, not a view of the portal —
              it needs the whole window, so it is a route rather than a tab
              panel. */}
          <button
            type="button"
            className="cv-tabpill"
            onClick={() => navigate(`/admin/clients/${clientId}/projects/${project.id}/feedback`)}
          >
            Feedback board
          </button>
        </div>

        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                <h2 className="cv-card-title">Phase</h2>
                <span className="cv-chip cv-chip--gray">Sample phases</span>
                <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--cv-muted)" }}>
                  {counts.total === 0
                    ? "No tasks on the board yet"
                    : `${counts.done} of ${counts.total} tasks · ${counts.pct}%`}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {PROJECT_PHASES.map((phase, i) => (
                  <div
                    key={phase}
                    className={`cv-ph ${i < phaseIndex ? "cv-ph--done" : i === phaseIndex ? "cv-ph--now" : ""}`}
                  >
                    <small>{i < phaseIndex ? "Done" : i === phaseIndex ? "Now" : i === phaseIndex + 1 ? "Next" : "Later"}</small>
                    {phase}
                  </div>
                ))}
              </div>
              <span className="cv-bar"><i style={{ width: `${counts.pct}%` }} /></span>
              <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>
                These are placeholder phases until projects carry real ones —
                they read off the task percentage, not off a plan.
              </p>
            </section>

            <div className="cv-pair">
              <section className="cv-card cv-card-pad">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <h2 className="cv-card-title">Needs your review</h2>
                  <span className="cv-chip cv-chip--blue">{counts.needsReview}</span>
                </div>
                {!needsReview.length
                  ? <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>Nothing waiting on you.</p>
                  : <>
                      <TaskList tasks={needsReview} dot="#2F5BEA" />
                      {needsReview.length > 4 && (
                        <a href={boardUrl} target="_blank" rel="noreferrer"
                          style={{ display: "inline-block", fontSize: 14, padding: "12px 0 0" }}>
                          See all {needsReview.length}
                        </a>
                      )}
                    </>}
              </section>

              <section className="cv-card cv-card-pad">
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <h2 className="cv-card-title">Blocked</h2>
                  <span className="cv-chip cv-chip--amber">{counts.blocked}</span>
                </div>
                {!blocked.length
                  ? <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>Nothing blocked.</p>
                  : <>
                      <TaskList tasks={blocked} dot="#E8590C" />
                      {blocked.length > 4 && (
                        <a href={boardUrl} target="_blank" rel="noreferrer"
                          style={{ display: "inline-block", fontSize: 14, padding: "12px 0 0" }}>
                          See all {blocked.length}
                        </a>
                      )}
                    </>}
              </section>
            </div>

            <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h2 className="cv-card-title">Project details</h2>
              <dl className="cv-deflist">
                <div>
                  <dt>Client</dt>
                  <dd>{[client?.contact_name, client?.business_name].filter(Boolean).join(" · ") || "—"}</dd>
                </div>
                <div><dt>Type</dt><dd>{type.label}</dd></div>
                <div>
                  <dt>Repo</dt>
                  <dd>{project.repo_url
                    ? <a href={project.repo_url} target="_blank" rel="noreferrer">{project.repo_url}</a>
                    : "Not set"}</dd>
                </div>
                <div><dt>Agent autonomy</dt><dd>{project.agent_autonomy || "Inherited from the agent"}</dd></div>
                <div><dt>Queue</dt><dd>{project.queue_enabled ? "On" : "Off"}</dd></div>
              </dl>
            </section>
          </div>
        )}

        {tab === "intake" && <IntakeTab clientId={clientId} />}

        {tab === "proposals" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <ProjectProposals clientId={clientId} clientProjectId={project.id} projectName={project.name} />
            {project.type === "web_development" && (
              <ContractAuditPanel clientId={clientId} clientProjectId={project.id} />
            )}
          </div>
        )}

        {tab === "payments" && <ProjectInvoicesCard clientId={clientId} clientProjectId={project.id} />}

        {tab === "files" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* The Preview panel used to render here. It is gone: it
                listed the same pages, counted the same approvals and
                collected the same comments as the feedback board, from
                the same tables, in the old dark design — and the four
                things it could do that the board could not (copy the
                portal link, send a review email, crawl a live site,
                create a preview) have moved onto the board. */}
            <ProjectFilesPanel clientId={clientId} clientProjectId={project.id} />
            <section className="cv-card cv-card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <h2 className="cv-card-title">Links</h2>
              {!links.length
                ? <p style={{ margin: 0, fontSize: 14, color: "var(--cv-muted)" }}>No links saved for this project.</p>
                : links.map((l) => (
                    <a key={l.id} className="cv-proj" href={l.url} target="_blank" rel="noreferrer">
                      <span style={{ flex: "1 1 200px", minWidth: 0 }}>
                        <span className="cv-proj__name">{l.label}</span>
                        <span className="cv-proj__type">{l.url}</span>
                      </span>
                      <ExternalLink size={16} />
                    </a>
                  ))}
            </section>
          </div>
        )}

        {tab === "notes" && (
          <ProjectNotesTab
            clientProjectId={project.id}
            projectNotes={project.notes}
            notes={notes}
            onChanged={reload}
          />
        )}

        {tab === "social" && <SocialTab clientProjectId={project.id} />}

        {/* Settings were a tab you visited once per project and never again. */}
        <SidePanel
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          title="Project settings"
          subtitle={project.name}
          width={520}
        >
          <DeliveryTargetsCard clientProjectId={project.id} />
          <ProgressReportSettingsCard clientId={clientId} clientProjectId={project.id} />
          <ProjectSecretsPanel clientProjectId={project.id} />
          <ArchiveProjectCard
            clientProjectId={project.id}
            projectName={project.name}
            status={project.status}
            onChanged={reload}
          />
        </SidePanel>
      </div>
    </Shell>
  );
}
