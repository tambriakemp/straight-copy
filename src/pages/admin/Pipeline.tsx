// Placeholder for CRE-332 Phase 6. The real kanban (SureContact two-way
// sync) is gated until Bree confirms the stage-name mapping — see the
// issue. This just gives the new side nav's Pipeline item somewhere to land.
import { Workflow } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import PageHeader from "@/components/admin/cv/PageHeader";
import EmptyState from "@/components/admin/cv/EmptyState";

export default function Pipeline() {
  return (
    <AdminLayout>
      <div className="cv-admin" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <PageHeader eyebrow="Daily / Pipeline" title="Pipeline" subtitle="Leads and clients by stage, synced both ways with SureContact." />
        <EmptyState
          icon={Workflow}
          title="Coming soon"
          subtitle="Pipeline is waiting on you to confirm the SureContact stage mapping on CRE-332 before it's built."
        />
      </div>
    </AdminLayout>
  );
}
