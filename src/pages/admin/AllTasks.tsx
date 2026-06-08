import AdminLayout from "@/components/admin/AdminLayout";
import ProjectTasksPanel from "@/components/admin/tasks/ProjectTasksPanel";

export default function AllTasks() {
  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">Operations</div>
            <h1 className="roster__title">All <em>tasks</em></h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              Every task across every client and project. Filter by client to focus, switch to calendar for due dates at a glance.
            </p>
          </div>
        </div>
        <div style={{ marginTop: 24 }}>
          <ProjectTasksPanel />
        </div>
      </div>
    </AdminLayout>
  );
}
