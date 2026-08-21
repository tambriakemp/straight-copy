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
import { useState } from "react";
import ClientsTable from "@/components/admin/ClientsTable";
import AgentClientView from "@/components/admin/agent/AgentClientView";
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
  // Which client is open, if any. Local rather than in the URL: it is a step
  // inside the panel, and putting it in the address bar would make the browser
  // back button fight the panel's own back button.
  const [openClient, setOpenClient] = useState<string | null>(null);
  const meta = TITLES[view];

  // The client view brings its own heading and back control.
  if (view === "clients" && openClient) {
    return (
      <section className="ws__work">
        <AgentClientView clientId={openClient} onBack={() => setOpenClient(null)} />
      </section>
    );
  }

  return (
    <section className="ws__work">
      <header className="ws__work-head">
        <div className="ws__work-eyebrow">{meta.eyebrow}</div>
        <h2 className="ws__work-title">{meta.title}</h2>
        <p className="ws__work-sub">{meta.sub}</p>
      </header>

      <div className="ws__work-body">
        {view === "clients" && (
          // Opens in place rather than navigating away, so looking a client up
          // mid-conversation does not cost you the conversation.
          <ClientsTable onOpen={setOpenClient} />
        )}
        {view === "tasks" && <ProjectTasksPanel />}
        {view === "knowledge" && <WikiList embedded />}
      </div>
    </section>
  );
}
