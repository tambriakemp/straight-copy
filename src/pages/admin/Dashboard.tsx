import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import ClientsTable from "@/components/admin/ClientsTable";
import NewClientDialog from "@/components/admin/NewClientDialog";


export default function Dashboard() {
  const navigate = useNavigate();
  // Bumped after a create so the table refetches. Cheaper than threading a
  // reload handle out of it for the one event that changes the list.
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__ghost">CRE8</div>

        <div className="roster__head">
          <div className="roster__title-block">
            <div className="roster__eyebrow">Client Roster</div>
            <h1 className="roster__title">All <em>clients</em></h1>
            <hr className="roster__rule" />
            <p className="roster__sub">
              Every brand on our books. Open a client to see their projects — automation builds and site previews.
            </p>
          </div>
        </div>

        <div className="roster__toolbar">
        <div className="roster__actions">
            <button className="crm-btn crm-btn--ghost" onClick={() => navigate("/admin/invites")}>
              ✉ Invites
            </button>
            <NewClientDialog
              onCreated={(clientId) => {
                setReloadKey((k) => k + 1);
                navigate(`/admin/clients/${clientId}`);
              }}
            />
          </div>
        </div>

        {/* One table, used here and in the agent Workspace rail, so the two
            can never drift into showing different clients. */}
        <ClientsTable key={reloadKey} />
      </div>
    </AdminLayout>
  );
}
