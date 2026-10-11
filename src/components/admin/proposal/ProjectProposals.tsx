// The project page's Proposals tab.
//
// The same grouped list as /admin/proposals, scoped to one project, with
// Upload going to the same form. It replaces ProjectProposalsPanel — 822
// lines of dark-themed cards with their own upload disclosure, their own
// version rows and their own word for a replaced version. Two lists of
// the same thing drift, and these two already had: the panel called a
// replaced version SUPERSEDED while the main list showed it as a live
// proposal still waiting on the client.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ProposalGroupList, { type ListProposal } from "./ProposalGroupList";

const SELECT =
  "id, client_id, client_project_id, title, status, version, version_group_id, total_cents, " +
  "sent_at, first_viewed_at, client_signed_at, agency_countersigned_at, declined_at, decline_reason";

export default function ProjectProposals({
  clientId, clientProjectId, projectName,
}: {
  clientId: string;
  clientProjectId: string;
  projectName: string;
}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ListProposal[] | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("client_proposals")
      .select(SELECT)
      .eq("client_project_id", clientProjectId)
      .order("created_at", { ascending: false });
    if (error) { toast.error(error.message); setRows([]); return; }
    setRows((data ?? []) as unknown as ListProposal[]);
  }, [clientProjectId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <h2 className="cv-card-title" style={{ flex: 1 }}>Proposals</h2>
        <button
          type="button" className="cv-btn-ink cv-btn-ink--sm"
          onClick={() => navigate(`/admin/proposals/new?project=${clientProjectId}&client=${clientId}`)}
        >
          <Plus size={16} /> Upload proposal
        </button>
      </div>
      {rows === null
        ? <p className="cv-page-sub">Loading…</p>
        : <ProposalGroupList proposals={rows} subtitleFor={() => projectName} />}
    </div>
  );
}
