import { Eye, Copy, RefreshCw, FileSignature, Pencil } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Props = {
  clientId: string;
  onEdit?: () => void;
};

export default function ClientPortalActions({ clientId, onEdit }: Props) {
  const copy = async (path: string, label: string) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy link");
    }
  };

  const syncSureContact = async () => {
    const t = toast.loading("Syncing to SureContact…");
    try {
      const { data, error } = await supabase.functions.invoke(
        "sync-client-to-surecontact",
        { body: { clientId } },
      );
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Sync failed");
      toast.success("Synced to SureContact", { id: t });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed", { id: t });
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              className="detail__portal-btn detail__portal-btn--icon"
              href={`/portal/${clientId}?as=admin`}
              target="_blank"
              rel="noreferrer"
              aria-label="Open as client"
            >
              <Eye size={14} strokeWidth={1.5} />
            </a>
          </TooltipTrigger>
          <TooltipContent>Open this client's portal as an admin preview</TooltipContent>
        </Tooltip>

        {onEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="detail__portal-btn detail__portal-btn--ghost detail__portal-btn--icon"
                onClick={onEdit}
                aria-label="Edit contact details"
              >
                <Pencil size={14} strokeWidth={1.5} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Edit contact details</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="detail__portal-btn detail__portal-btn--ghost detail__portal-btn--icon"
              onClick={() => copy(`/portal/${clientId}`, "Portal link")}
              aria-label="Copy portal link"
            >
              <Copy size={14} strokeWidth={1.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Copy portal link</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="detail__portal-btn detail__portal-btn--ghost detail__portal-btn--icon"
              onClick={() => copy(`/portal/${clientId}?focus=contract`, "Contract link")}
              aria-label="Copy contract link"
            >
              <FileSignature size={14} strokeWidth={1.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Copy direct link to the client's contract</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="detail__portal-btn detail__portal-btn--ghost detail__portal-btn--icon"
              onClick={syncSureContact}
              aria-label="Sync to SureContact"
            >
              <RefreshCw size={14} strokeWidth={1.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Sync portal link, tier &amp; stage to SureContact</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
