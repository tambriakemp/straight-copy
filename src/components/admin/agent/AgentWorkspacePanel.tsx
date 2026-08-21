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
import ProjectDetail from "@/pages/admin/ProjectDetail";
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
  /**
   * Where you are inside the Clients panel.
   *
   * A stack, not a route. Every page opens here now — roster, then a client,
   * then one of their projects — and each level has its own back control, so
   * putting this in the address bar would make the browser back button fight
   * the panel's. Changing rail view resets it, which is what leaving and
   * coming back should do.
   */
  const [stack, setStack] = useState<
    | { at: "list" }
    | { at: "client"; clientId: string }
    | { at: "project"; clientId: string; projectId: string }
  >({ at: "list" });

  const meta = TITLES[view];

  // Each of these brings its own heading and back control.
  if (view === "clients" && stack.at === "client") {
    return (
      <section className="ws__work">
        <AgentClientView
          clientId={stack.clientId}
          onBack={() => setStack({ at: "list" })}
          onOpenProject={(projectId) =>
            setStack({ at: "project", clientId: stack.clientId, projectId })}
        />
      </section>
    );
  }

  if (view === "clients" && stack.at === "project") {
    return (
      <section className="ws__work">
        <ProjectDetail
          clientId={stack.clientId}
          projectId={stack.projectId}
          embedded
          onBack={() => setStack({ at: "client", clientId: stack.clientId })}
        />
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
          <ClientsTable onOpen={(clientId) => setStack({ at: "client", clientId })} />
        )}
        {view === "tasks" && <ProjectTasksPanel />}
        {view === "knowledge" && <WikiList embedded />}
      </div>
    </section>
  );
}
