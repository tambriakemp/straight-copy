// The new /admin/clients list (CRE-332 Phase 4) — same toggle-gated pattern
// as ClientDetail.tsx. Off by default: this renders exactly the old
// Dashboard.tsx page, which already wraps itself in AdminLayout, so nothing
// changes for anyone who hasn't opted into the new shell.
import AdminLayout from "@/components/admin/AdminLayout";
import PageHeader from "@/components/admin/cv/PageHeader";
import DarkEmbed from "@/components/admin/cv/DarkEmbed";
import ClientsTable from "@/components/admin/ClientsTable";
import { useNewAdminLayout } from "@/hooks/useNewAdminLayout";
import Dashboard from "./Dashboard";

export default function ClientsList() {
  const { enabled: newLayout } = useNewAdminLayout();

  if (!newLayout) return <Dashboard />;

  return (
    <AdminLayout>
      <div className="cv-admin" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <PageHeader
          eyebrow="Clients"
          title="All clients"
          subtitle="Every brand on our books. Open a client to see their projects, proposals and payments."
        />
        <div style={{ padding: "0 32px 32px" }}>
          {/* ClientsTable is dark-themed (.crm-shell), reused here rather than
              rebuilt — see DarkEmbed for why it needs its own dark surface. */}
          <DarkEmbed style={{ padding: 16, minHeight: 420 }}>
            <ClientsTable />
          </DarkEmbed>
        </div>
      </div>
    </AdminLayout>
  );
}
