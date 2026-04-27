import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type ContractRow = {
  id: string;
  tier: string;
  template_version: string;
  client_signature_name: string;
  client_signature_type: "typed" | "drawn";
  client_signed_at: string;
  client_ip: string | null;
  client_user_agent: string | null;
  agency_signer_name: string;
  agency_countersigned_at: string;
  pdf_path: string | null;
};

export default function AdminContractSection({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<ContractRow | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("client_contracts")
        .select(
          "id, tier, template_version, client_signature_name, client_signature_type, client_signed_at, client_ip, client_user_agent, agency_signer_name, agency_countersigned_at, pdf_path",
        )
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (active) {
        setContract(data as ContractRow | null);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [clientId]);

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

      // Fetch as blob to force a real file download (cross-origin storage URLs
      // ignore the `download` attribute, and async window.open is often blocked).
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

  return (
    <section className="admin-contract">
      <div className="admin-contract__head">
        <div className="admin-contract__eyebrow">Contract</div>
        <div className="admin-contract__title">
          {contract ? "Service Agreement signed" : "Service Agreement awaiting signature"}
        </div>
      </div>
      {contract ? (
        <div className="admin-contract__body">
          <div className="admin-contract__row">
            <span className="lbl">Version</span>
            <span className="val">{contract.template_version}</span>
          </div>
          <div className="admin-contract__row">
            <span className="lbl">Client signature</span>
            <span className="val">
              {contract.client_signature_name} ({contract.client_signature_type})
            </span>
          </div>
          <div className="admin-contract__row">
            <span className="lbl">Signed</span>
            <span className="val">
              {new Date(contract.client_signed_at).toLocaleString()}
            </span>
          </div>
          <div className="admin-contract__row">
            <span className="lbl">Countersigned by</span>
            <span className="val">
              {contract.agency_signer_name} ·{" "}
              {new Date(contract.agency_countersigned_at).toLocaleString()}
            </span>
          </div>
          {contract.client_ip && (
            <div className="admin-contract__row">
              <span className="lbl">Client IP</span>
              <span className="val val--mono">{contract.client_ip}</span>
            </div>
          )}
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
            The client hasn't signed yet. Share the portal link — they can review and sign from the
            Intake panel.
          </p>
        </div>
      )}
    </section>
  );
}
