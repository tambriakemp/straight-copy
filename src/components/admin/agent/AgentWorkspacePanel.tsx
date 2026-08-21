// Clients, Tasks and the Knowledge Base, inside the agent shell.
//
// Bree asked for these to live under a Workspace section in each agent's rail,
// the way Drive does in the reference she sent. The point is continuity: asking
// Bria about a client and then looking that client up should not cost you the
// conversation.
//
// These are the SAME components the standalone pages render, not copies. A
// second implementation of the client roster would drift from the first within
// a week, and then two screens would disagree about who your clients are.
import { useNavigate } from "react-router-dom";
import ClientsTable from "@/components/admin/ClientsTable";
import ProjectTasksPanel from "@/components/admin/tasks/ProjectTasksPanel";
import { WikiList } from "@/pages/admin/Wiki";

export type WorkspaceView = "clients" | "tasks" | "knowledge";

const TITLES: Record<WorkspaceView, { eyebrow: string; title: string; sub: string }> = {
  clients: {
    eyebrow: "Workspace",
    title: "Clients",
    sub: "Everyone on the books. Open one to see their companies and projects.",
  },
  tasks: {
    eyebrow: "Workspace",
    title: "Tasks",
    sub: "Every task across every client and project.",
  },
  knowledge: {
    eyebrow: "Workspace",
    title: "Knowledge Base",
    sub: "How the agency works, written down.",
  },
};

export default function AgentWorkspacePanel({ view }: { view: WorkspaceView }) {
  const navigate = useNavigate();
  const meta = TITLES[view];

  return (
    <section className="ws__work">
      <header className="ws__work-head">
        <div className="ws__work-eyebrow">{meta.eyebrow}</div>
        <h2 className="ws__work-title">{meta.title}</h2>
        <p className="ws__work-sub">{meta.sub}</p>
      </header>

      <div className="ws__work-body">
        {view === "clients" && (
          // Opening a client leaves the agent — a client page is a full page of
          // its own, and squeezing it into this column would serve neither.
          <ClientsTable dense onOpen={(id) => navigate(`/admin/clients/${id}`)} />
        )}
        {view === "tasks" && <ProjectTasksPanel />}
        {view === "knowledge" && <WikiList embedded />}
      </div>
    </section>
  );
}
