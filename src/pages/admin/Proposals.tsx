import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { loadAdminOperations, projectMap, type AdminOperations } from "@/lib/adminOperations";

const fmtUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export default function Proposals() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminOperations | null>(null);
  const [status, setStatus] = useState("open");

  useEffect(() => {
    loadAdminOperations().then(setData).catch((error) => toast.error(error.message || "Failed to load proposals"));
  }, []);

  const projects = useMemo(() => projectMap(data?.projects ?? []), [data]);
  const rows = (data?.proposals ?? []).filter((proposal) => status === "all"
    || (status === "open" ? proposal.status === "sent" && !proposal.client_signed_at : proposal.status === status));

  return (
    <AdminLayout>
      <div className="roster">
        <div className="roster__head"><div className="roster__title-block">
          <div className="roster__eyebrow">Client work</div>
          <h1 className="roster__title">All <em>proposals</em></h1>
          <hr className="roster__rule" />
          <p className="roster__sub">Proposals across every client and project, with signature status in one place.</p>
        </div></div>
        <div className="ctbl__bar">
          <select className="ctbl__filter" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter proposals">
            <option value="open">Awaiting signature</option><option value="draft">Draft</option>
            <option value="signed">Signed</option><option value="declined">Declined</option><option value="voided">Voided</option>
            <option value="superseded">Superseded</option><option value="all">All statuses</option>
          </select>
          <span className="ctbl__count">{data ? `${rows.length} proposals` : "Loading…"}</span>
        </div>
        <div className="ctbl__scroll"><table className="ctbl__table"><thead><tr>
          <th>Proposal</th><th>Client</th><th className="ctbl__col-contact">Project</th><th>Status</th><th>Amount</th><th>Sent</th>
        </tr></thead><tbody>
          {!data && <tr><td colSpan={6} className="ctbl__empty">Loading…</td></tr>}
          {data && !rows.length && <tr><td colSpan={6} className="ctbl__empty">No proposals match this filter.</td></tr>}
          {rows.map((proposal) => {
            const project = projects[proposal.client_project_id];
            return <tr key={proposal.id} tabIndex={0} onClick={() => project && navigate(`/admin/clients/${proposal.client_id}/projects/${project.id}`)}
              onKeyDown={(event) => { if (event.key === "Enter" && project) navigate(`/admin/clients/${proposal.client_id}/projects/${project.id}`); }}>
              <td className="ctbl__name">{proposal.title}{proposal.version > 1 ? ` (v${proposal.version})` : ""}</td><td>{data?.clientNames[proposal.client_id] ?? "—"}</td>
              <td className="ctbl__col-contact">{project?.name ?? "—"}</td><td><span className={`ctbl__pill ctbl__pill--${proposal.status}`}>{proposal.status === "sent" ? "Awaiting signature" : proposal.status}</span></td>
              <td>{proposal.total_cents != null ? fmtUSD(proposal.total_cents) : "—"}</td>
              <td className="ctbl__when">{proposal.sent_at ? new Date(proposal.sent_at).toLocaleDateString() : "Not sent"}</td>
            </tr>;
          })}
        </tbody></table></div>
      </div>
    </AdminLayout>
  );
}