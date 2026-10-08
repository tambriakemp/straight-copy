import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import PageHeader from "@/components/admin/cv/PageHeader";
import EmptyState from "@/components/admin/cv/EmptyState";
import StatusChip from "@/components/admin/cv/StatusChip";
import { loadAdminOperations, projectMap, type AdminOperations, type ProposalRollup } from "@/lib/adminOperations";

const fmtUSD = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

type CvTab = "draft" | "awaiting" | "signed" | "all" | "templates";

const CV_TABS: Array<{ key: CvTab; label: string }> = [
  { key: "draft", label: "Drafts" },
  { key: "awaiting", label: "Awaiting signature" },
  { key: "signed", label: "Signed" },
  { key: "all", label: "All" },
  { key: "templates", label: "Templates" },
];

function matchesCvTab(proposal: ProposalRollup, tab: CvTab): boolean {
  if (tab === "all" || tab === "templates") return true;
  if (tab === "draft") return proposal.status === "draft";
  if (tab === "awaiting") return proposal.status === "sent" && !proposal.client_signed_at;
  return proposal.status === "signed";
}

export default function Proposals() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminOperations | null>(null);
  const [cvTab, setCvTab] = useState<CvTab>("awaiting");

  useEffect(() => {
    loadAdminOperations().then(setData).catch((error) => toast.error(error.message || "Failed to load proposals"));
  }, []);

  const projects = useMemo(() => projectMap(data?.projects ?? []), [data]);
  const cvRows = (data?.proposals ?? []).filter((proposal) => matchesCvTab(proposal, cvTab));

  return (
    <AdminLayout>
      <div className="cv-admin" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <PageHeader
          eyebrow="Work / Proposals"
          title="Proposals"
          subtitle="Every proposal across every client and project, with signature status in one place."
        />
        <div className="cv-tabs" style={{ padding: "0 32px" }}>
          {CV_TABS.map((t) => (
            <button key={t.key} type="button" className={`cv-tab${cvTab === t.key ? " cv-tab--active" : ""}`} onClick={() => setCvTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ padding: "0 32px 32px" }}>
          {cvTab === "templates" ? (
            <EmptyState
              icon={FileText}
              title="Templates are coming"
              subtitle="Reusable proposal templates arrive with CRE-288. For now, every proposal starts from its own upload."
            />
          ) : !data ? (
            <div style={{ fontSize: 14, color: "var(--cv-muted)" }}>Loading…</div>
          ) : !cvRows.length ? (
            <EmptyState icon={FileText} title="No proposals" subtitle="Nothing matches this tab yet." />
          ) : (
            <div className="cv-simple-list">
              {cvRows.map((proposal) => {
                const project = projects[proposal.client_project_id];
                return (
                  <button
                    key={proposal.id}
                    type="button"
                    className="cv-simple-list__row"
                    style={{ width: "100%", background: "none", border: "none", borderBottom: "1px solid var(--cv-border)", cursor: project ? "pointer" : "default", textAlign: "left" }}
                    onClick={() => project && navigate(`/admin/clients/${proposal.client_id}/projects/${project.id}`)}
                  >
                    <span className="cv-simple-list__main">
                      <span className="cv-simple-list__title">{proposal.title}{proposal.version > 1 ? ` (v${proposal.version})` : ""}</span>
                      <span className="cv-simple-list__sub">
                        {data.clientNames[proposal.client_id] ?? "—"} · {project?.name ?? "—"}
                        {proposal.total_cents != null ? ` · ${fmtUSD(proposal.total_cents)}` : ""}
                      </span>
                    </span>
                    <span className="cv-simple-list__when">{proposal.sent_at ? new Date(proposal.sent_at).toLocaleDateString() : "Not sent"}</span>
                    <StatusChip label={proposal.status === "sent" ? "Awaiting signature" : proposal.status} status={proposal.status} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}