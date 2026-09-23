import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { formatMoney, loadAdminOperations, projectMap, type AdminOperations } from "@/lib/adminOperations";

export default function Payments() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminOperations | null>(null);
  const [status, setStatus] = useState("outstanding");
  useEffect(() => {
    loadAdminOperations().then(setData).catch((error) => toast.error(error.message || "Failed to load payments"));
  }, []);
  const projects = useMemo(() => projectMap(data?.projects ?? []), [data]);
  const rows = (data?.invoices ?? []).filter((invoice) => status === "all"
    || (status === "outstanding" ? invoice.status === "sent" : invoice.status === status));
  const outstanding = (data?.invoices ?? []).filter((invoice) => invoice.status === "sent")
    .reduce((sum, invoice) => sum + invoice.amount_cents, 0);

  return <AdminLayout><div className="roster">
    <div className="roster__head"><div className="roster__title-block">
      <div className="roster__eyebrow">Client work</div><h1 className="roster__title">All <em>payments</em></h1>
      <hr className="roster__rule" /><p className="roster__sub">Payment schedules, due dates, and outstanding balances across every project.</p>
    </div></div>
    <div className="ops-summary"><div><span>Outstanding balance</span><strong>{data ? formatMoney(outstanding) : "—"}</strong></div></div>
    <div className="ctbl__bar"><select className="ctbl__filter" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter payments">
      <option value="outstanding">Outstanding</option><option value="scheduled">Scheduled</option><option value="paid">Paid</option><option value="failed">Failed</option><option value="void">Void</option><option value="all">All statuses</option>
    </select><span className="ctbl__count">{data ? `${rows.length} payments` : "Loading…"}</span></div>
    <div className="ctbl__scroll"><table className="ctbl__table"><thead><tr><th>Payment</th><th>Client</th><th className="ctbl__col-contact">Project</th><th>Due</th><th>Amount</th><th>Status</th></tr></thead><tbody>
      {!data && <tr><td colSpan={6} className="ctbl__empty">Loading…</td></tr>}
      {data && !rows.length && <tr><td colSpan={6} className="ctbl__empty">No payments match this filter.</td></tr>}
      {rows.map((invoice) => { const project = projects[invoice.client_project_id]; return <tr key={invoice.id} tabIndex={0}
        onClick={() => project && navigate(`/admin/clients/${invoice.client_id}/projects/${project.id}`)}
        onKeyDown={(event) => { if (event.key === "Enter" && project) navigate(`/admin/clients/${invoice.client_id}/projects/${project.id}`); }}>
        <td className="ctbl__name">{invoice.label}</td><td>{data?.clientNames[invoice.client_id] ?? "—"}</td><td className="ctbl__col-contact">{project?.name ?? "—"}</td>
        <td className="ctbl__when">{invoice.due_date ? new Date(`${invoice.due_date}T12:00:00`).toLocaleDateString() : "—"}</td><td>{formatMoney(invoice.amount_cents, invoice.currency)}</td>
        <td><span className={`ctbl__pill ctbl__pill--${invoice.status}`}>{invoice.status}</span></td></tr>; })}
    </tbody></table></div>
  </div></AdminLayout>;
}