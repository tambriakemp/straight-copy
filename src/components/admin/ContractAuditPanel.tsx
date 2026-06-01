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
 * Signing audit panel for a single Web Dev (or any client) project. Shows when
 * the client signed, when the agency countersigned, the agency identity used,
 * and which project tasks were auto-completed by the signing event.
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

  if (loading) return null;

  const linkedToThisProject = contract?.client_project_id === clientProjectId;

  return (
    <section className="admin-contract" style={{ marginTop: 24 }}>
      <div className="admin-contract__head">
        <div className="admin-contract__eyebrow">Signing audit log</div>
        <div className="admin-contract__title">
          {contract ? "Service Agreement — execution record" : "Service Agreement — not yet signed"}
        </div>
      </div>
      {contract ? (
        <div className="admin-contract__body">
          <div className="admin-contract__row">
            <span className="lbl">Client signed</span>
            <span className="val">
              {new Date(contract.client_signed_at).toLocaleString()} ·{" "}
              {contract.client_signature_name} ({contract.client_signature_type})
            </span>
          </div>
          <div className="admin-contract__row">
            <span className="lbl">Agency countersigned</span>
            <span className="val">
              {new Date(contract.agency_countersigned_at).toLocaleString()} ·{" "}
              {contract.agency_signer_name} (auto)
            </span>
          </div>
          <div className="admin-contract__row">
            <span className="lbl">Linked project</span>
            <span className="val">
              {contract.client_project_id ? (
                linkedToThisProject ? (
                  <span style={{ color: "var(--crm-accent)" }}>✓ This project</span>
                ) : (
                  <span style={{ color: "var(--crm-taupe)" }}>
                    Other project ({contract.client_project_id.slice(0, 8)}…)
                  </span>
                )
              ) : (
                <span style={{ color: "var(--crm-taupe)" }}>Not linked to any project</span>
              )}
            </span>
          </div>
          {contract.client_ip && (
            <div className="admin-contract__row">
              <span className="lbl">Client IP</span>
              <span className="val val--mono">{contract.client_ip}</span>
            </div>
          )}

          <div className="admin-contract__row" style={{ alignItems: "flex-start" }}>
            <span className="lbl">Auto-completed tasks</span>
            <span className="val" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {activity.length === 0 ? (
                <span style={{ color: "var(--crm-taupe)" }}>
                  No tasks were auto-completed by this signing event.
                </span>
              ) : (
                activity.map((a) => {
                  const num = (a.metadata as { num?: string } | null)?.num ?? "";
                  return (
                    <span key={a.id} style={{ fontSize: 14 }}>
                      <span style={{ color: "var(--crm-accent)" }}>✓</span>{" "}
                      <strong>{num}</strong> {a.task?.name?.replace(/^\d+\.\d+\s*—\s*/, "") ?? a.task_id}
                      {" "}
                      <span style={{ color: "var(--crm-taupe)" }}>
                        · {new Date(a.created_at).toLocaleString()}
                      </span>
                    </span>
                  );
                })
              )}
            </span>
          </div>

          <div className="admin-contract__actions">
            <button
              type="button"
              className="detail__portal-btn"
              onClick={downloadPdf}
              disabled={!contract.pdf_path}
            >
              ⇣ Download signed PDF
            </button>
          </div>
        </div>
      ) : (
        <div className="admin-contract__body">
          <p className="admin-contract__empty">
            The client hasn't signed yet. Once they sign in the portal, the agency countersignature
            and project task auto-completion will appear here.
          </p>
        </div>
      )}
    </section>
  );
}
