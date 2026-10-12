import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type ContractRow = {
  id: string;
  client_id: string;
  client_project_id: string | null;
  tier: string;
  template_version: string;
  client_signature_name: string;
  client_signature_type: "typed" | "drawn";
  client_signed_at: string;
  client_ip: string | null;
  agency_signer_name: string;
  agency_countersigned_at: string;
  pdf_path: string | null;
  created_at: string;
};

type TaskActivityRow = {
  id: string;
  task_id: string;
  kind: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  task?: { name: string; status: string } | null;
};

/**
 * The execution record for a signed service agreement: when the client
 * signed, when the agency countersigned, who with, from which IP, and
 * which project tasks the signing event auto-completed.
 *
 * It renders NOTHING until there is a contract. It used to print "not
 * yet signed" in a grey slab under an empty Proposals tab — a record of
 * something that has not happened is not a record, and a client who has
 * not signed yet is the ordinary case, not a state worth a panel.
 */
export default function ContractAuditPanel({
  clientId,
  clientProjectId,
}: {
  clientId: string;
  clientProjectId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<ContractRow | null>(null);
  const [activity, setActivity] = useState<TaskActivityRow[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const { data: c } = await supabase
          .from("client_contracts")
          .select(
            "id, client_id, client_project_id, tier, template_version, client_signature_name, client_signature_type, client_signed_at, client_ip, agency_signer_name, agency_countersigned_at, pdf_path, created_at",
          )
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Pull activity rows produced by the contract-sign auto-completion.
        // Joined to project_tasks so we can display task name + final status.
        const { data: act } = await supabase
          .from("project_task_activity")
          .select(
            "id, task_id, kind, message, metadata, created_at, task:project_tasks!inner(name, status, client_project_id)",
          )
          .eq("kind", "contract_auto_complete")
          .eq("task.client_project_id", clientProjectId)
          .order("created_at", { ascending: true });

        if (!active) return;
        setContract((c as ContractRow | null) ?? null);
        setActivity(((act ?? []) as unknown) as TaskActivityRow[]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [clientId, clientProjectId]);

  const downloadPdf = async () => {
    if (!contract) return;
    const filename = `cre8-visions-service-agreement-${contract.id}.pdf`;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/contract-sign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ action: "download", clientId, contractId: contract.id }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.pdfUrl) throw new Error(data.error || "No PDF available");
      try {
        const fileResp = await fetch(data.pdfUrl);
        if (!fileResp.ok) throw new Error("Could not retrieve PDF");
        const blob = await fileResp.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      } catch {
        window.open(data.pdfUrl, "_blank", "noopener");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  };

  // Nothing to show until something has been signed.
  if (loading || !contract) return null;

  const linkedToThisProject = contract.client_project_id === clientProjectId;

  return (
    <section className="cv-card cv-card-pad">
      <div className="cv-card-head">
        <h2 className="cv-card-title">Signing audit log</h2>
        <span className="cv-chip cv-chip--green">Signed</span>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--cv-muted)" }}>
        The execution record for the service agreement on this project.
      </p>
      {(
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="cv-defrow">
            <span className="cv-defrow__lbl">Client signed</span>
            <span className="cv-defrow__val">
              {new Date(contract.client_signed_at).toLocaleString()} ·{" "}
              {contract.client_signature_name} ({contract.client_signature_type})
            </span>
          </div>
          <div className="cv-defrow">
            <span className="cv-defrow__lbl">Agency countersigned</span>
            <span className="cv-defrow__val">
              {new Date(contract.agency_countersigned_at).toLocaleString()} ·{" "}
              {contract.agency_signer_name} (auto)
            </span>
          </div>
          <div className="cv-defrow">
            <span className="cv-defrow__lbl">Linked project</span>
            <span className="cv-defrow__val">
              {contract.client_project_id ? (
                linkedToThisProject ? (
                  <span style={{ color: "var(--cv-tone-green-fg)" }}>✓ This project</span>
                ) : (
                  <span style={{ color: "var(--cv-muted)" }}>
                    Other project ({contract.client_project_id.slice(0, 8)}…)
                  </span>
                )
              ) : (
                <span style={{ color: "var(--cv-muted)" }}>Not linked to any project</span>
              )}
            </span>
          </div>
          {contract.client_ip && (
            <div className="cv-defrow">
              <span className="cv-defrow__lbl">Client IP</span>
              <span style={{ fontFamily: "var(--cv-font-mono)", fontSize: 13 }}>{contract.client_ip}</span>
            </div>
          )}

          <div className="cv-defrow" style={{ alignItems: "flex-start" }}>
            <span className="cv-defrow__lbl">Auto-completed tasks</span>
            <span className="cv-defrow__val" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {activity.length === 0 ? (
                <span style={{ color: "var(--cv-muted)" }}>
                  No tasks were auto-completed by this signing event.
                </span>
              ) : (
                activity.map((a) => {
                  const num = (a.metadata as { num?: string } | null)?.num ?? "";
                  return (
                    <span key={a.id} style={{ fontSize: 16 }}>
                      <span style={{ color: "var(--cv-tone-green-fg)" }}>✓</span>{" "}
                      <strong>{num}</strong> {a.task?.name?.replace(/^\d+\.\d+\s*—\s*/, "") ?? a.task_id}
                      {" "}
                      <span style={{ color: "var(--cv-muted)" }}>
                        · {new Date(a.created_at).toLocaleString()}
                      </span>
                    </span>
                  );
                })
              )}
            </span>
          </div>

          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              className="cv-open"
              style={{ padding: "0 18px" }}
              onClick={downloadPdf}
              disabled={!contract.pdf_path}
            >
              Download signed PDF
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
