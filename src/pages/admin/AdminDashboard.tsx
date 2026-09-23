import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import ClientsTable from "@/components/admin/ClientsTable";
import NewClientDialog from "@/components/admin/NewClientDialog";
import { formatMoney, loadAdminOperations, projectMap, type AdminOperations } from "@/lib/adminOperations";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminOperations | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    loadAdminOperations().then(setData).catch((error) => toast.error(error.message || "Failed to load client status"));
  }, [reloadKey]);

  const projects = useMemo(() => projectMap(data?.projects ?? []), [data]);
  const proposals = (data?.proposals ?? []).filter((proposal) => proposal.status === "sent" && !proposal.client_signed_at);
  const balances = (data?.invoices ?? []).filter((invoice) => invoice.status === "sent");
  const upcoming = (data?.invoices ?? []).filter((invoice) => {
    if (!invoice.due_date || !["scheduled", "sent"].includes(invoice.status)) return false;
    return invoice.due_date >= new Date().toISOString().slice(0, 10);
  }).slice(0, 6);

  return <AdminLayout><div className="roster">
    <div className="roster__head"><div className="roster__title-block">
      <div className="roster__eyebrow">Client operations</div><h1 className="roster__title">All <em>clients</em></h1>
      <hr className="roster__rule" /><p className="roster__sub">Client work that needs attention, followed by the complete roster.</p>
    </div></div>

    <div className="ops-strip">
      <button onClick={() => navigate("/admin/proposals")}><span>Awaiting signature</span><strong>{data ? proposals.length : "—"}</strong><small>{proposals.slice(0, 2).map((item) => data?.clientNames[item.client_id]).join(" · ") || "Nothing waiting"}</small></button>
      <button onClick={() => navigate("/admin/payments")}><span>Outstanding balance</span><strong>{data ? formatMoney(balances.reduce((sum, item) => sum + item.amount_cents, 0)) : "—"}</strong><small>{balances.length ? `${balances.length} payment${balances.length === 1 ? "" : "s"} due` : "No balance due"}</small></button>
      <div><span>Previews awaiting approval</span><strong>{data ? data.previewsAwaitingApproval.length : "—"}</strong><small>{data?.previewsAwaitingApproval.slice(0, 2).map((preview) => preview.name).join(" · ") || "Nothing waiting"}</small></div>
      <button onClick={() => navigate("/admin/payments")}><span>Upcoming payments</span><strong>{data ? upcoming.length : "—"}</strong><small>{upcoming[0]?.due_date ? `Next ${new Date(`${upcoming[0].due_date}T12:00:00`).toLocaleDateString()}` : "No dates scheduled"}</small></button>
    </div>

    {upcoming.length > 0 && <div className="ops-dates" aria-label="Upcoming payment due dates">{upcoming.map((invoice) => {
      const project = projects[invoice.client_project_id];
      return <button key={invoice.id} onClick={() => project && navigate(`/admin/clients/${invoice.client_id}/projects/${project.id}`)}>
        <time>{new Date(`${invoice.due_date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>
        <span>{data?.clientNames[invoice.client_id]} · {invoice.label}</span><strong>{formatMoney(invoice.amount_cents, invoice.currency)}</strong>
      </button>;
    })}</div>}

    <div className="roster__toolbar"><div className="roster__actions">
      <NewClientDialog onCreated={(clientId) => { setReloadKey((key) => key + 1); navigate(`/admin/clients/${clientId}`); }} />
    </div></div>
    <ClientsTable key={reloadKey} signals={data?.signals} />
  </div></AdminLayout>;
}