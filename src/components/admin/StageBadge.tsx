import { cn } from "@/lib/utils";

export const STAGES = [
  { id: "intake_submitted", label: "Intake Submitted" },
  { id: "brand_voice_generation", label: "Brand Voice Generation" },
  { id: "build_in_progress", label: "Build In Progress" },
  { id: "ready_for_review", label: "Ready for Review" },
  { id: "delivered", label: "Delivered" },
  { id: "active_client", label: "Active Client" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export function StageBadge({ stage }: { stage: string }) {
  const s = STAGES.find((x) => x.id === stage);
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-100 text-zinc-700">
      {s?.label ?? stage}
    </span>
  );
}

export function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide",
        tier === "growth"
          ? "bg-amber-100 text-amber-800"
          : "bg-zinc-200 text-zinc-700"
      )}
    >
      {tier}
    </span>
  );
}
