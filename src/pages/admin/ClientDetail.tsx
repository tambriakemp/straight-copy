// One client, as a full page.
//
// A thin wrapper around the same view the agent Workspace rail renders. It used
// to be 874 lines of its own: project tiles with stage bars, an inline edit
// dialog, an inline contacts editor, a companies form. Two implementations of
// "a client" drift within a week, and then the page you opened from the agent
// and the page you opened from a link disagree about what a client is.
//
// What the redesign deliberately drops from the old page:
//   * Project TILES, with their journey stage bar and day counter. Bree asked
//     for a list, matching the client roster. The stage detail lives on the
//     project page, which is the only place it was ever complete.
//   * The inline preview copy/open buttons on those tiles — a preview belongs
//     to its project and is shown there.
// The resources sheet survived the tiles: it moved onto the project row, since
// dropping the control would have made links, credentials and files
// unreachable rather than tidier.
// Creating an automation build still seeds its journey nodes; that is behaviour,
// not decoration, and it moved into the shared view rather than being lost.
import { useParams } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import ClientDetailView from "@/components/admin/client/ClientDetailView";

// CRE-332 Phase 4/7: the 6-tab client page. AgentClientView (the old, pre-
// Phase-4 content here) still renders standalone in the agent Workspace
// rail — don't touch that component, only this page's use of it.
export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return <AdminLayout><div className="roster"><p>Client not found.</p></div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <ClientDetailView clientId={id} />
    </AdminLayout>
  );
}
