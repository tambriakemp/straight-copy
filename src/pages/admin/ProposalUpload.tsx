// Uploading a proposal, laid out to the Admin Journeys canvas.
//
// CRE-803: Paperclip is the source of truth for client_proposals as of the
// CP-6 cutover, so this page no longer uploads or creates one — the form,
// and the three proposal-sign calls (upload-url, create, supersede) it
// made, are kept as a comment below rather than deleted, since reviving
// this page means reviving exactly that shape and nothing simpler:
//
//   const up = await callFn({ action: "upload-url", clientId, clientProjectId, filename });
//   await fetch(up.signedUrl, { method: "PUT", headers: {...}, body: file });
//   const created = await callFn({ action: "create", clientId, clientProjectId,
//     title, description, sourcePdfPath: up.path, totalCents, paymentDueDays, paymentTerms });
//   if (isNewVersion) await callFn({ action: "supersede", clientId, proposalId: supersedesId, supersededByProposalId: newId });
//   if (andSend) await callFn({ action: "notify", clientId, proposalId: newId });
//
// The route (`/admin/proposals/new`) stays registered — every entry point
// into it now shows the notice instead of the button that used to land
// here, but a bookmark or an old link should still find a page, not a 404.
import { useNavigate, useSearchParams } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { ReadOnlyNotice } from "@/components/admin/ReadOnlyNotice";

export default function ProposalUpload() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const clientId = params.get("client") ?? "";
  const projectId = params.get("project") ?? "";

  return (
    <AdminLayout topBar={false}>
      <div className="cv-admin cv-page" style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <section className="cv-card cv-card-pad" style={{ maxWidth: 780, margin: "0 auto", width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600 }}>Upload a proposal</h1>
          <ReadOnlyNotice subject="proposal list" />
          <button
            type="button" className="cv-open cv-open--dark" style={{ alignSelf: "flex-start", padding: "0 20px" }}
            onClick={() => navigate(projectId && clientId ? `/admin/clients/${clientId}/projects/${projectId}` : "/admin/proposals")}
          >
            Back
          </button>
        </section>
      </div>
    </AdminLayout>
  );
}
