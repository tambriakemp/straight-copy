// The /admin/clients list (CRE-332 Phase 4, made the only layout in Phase 7).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import PageHeader from "@/components/admin/cv/PageHeader";
import DarkEmbed from "@/components/admin/cv/DarkEmbed";
import ClientsTable from "@/components/admin/ClientsTable";
import NewClientDialog from "@/components/admin/NewClientDialog";

export default function ClientsList() {
  const navigate = useNavigate();
  // Bumped after a create so the table refetches — same pattern the old
  // Dashboard.tsx page used (now deleted; this page replaced it in Phase 7).
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <AdminLayout>
      <div className="cv-admin" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <PageHeader
          eyebrow="Clients"
          title="All clients"
          subtitle="Every brand on our books. Open a client to see their projects, proposals and payments."
          right={
            <DarkEmbed inline style={{ padding: 4 }}>
              <NewClientDialog
                onCreated={(clientId) => {
                  setReloadKey((k) => k + 1);
                  navigate(`/admin/clients/${clientId}`);
                }}
              />
            </DarkEmbed>
          }
        />
        <div style={{ padding: "0 32px 32px" }}>
          {/* ClientsTable is dark-themed (.crm-shell), reused here rather than
              rebuilt — see DarkEmbed for why it needs its own dark surface. */}
          <DarkEmbed style={{ padding: 16, minHeight: 420 }}>
            <ClientsTable key={reloadKey} />
          </DarkEmbed>
        </div>
      </div>
    </AdminLayout>
  );
}
