// CRE-388: the brief's own markdown "Needs You" section is scratched —
// its structured rows (Brief.needs_you) merge into the same list as the
// live Paperclip-pending cards (useNeedsYouNow), so there is only one
// "Needs you now" list on the Today page. Pure/no React here on purpose,
// same house style as issueLinks.ts, so the merge is unit-testable without
// rendering.
import type { NeedsYouItem } from "./needsYouNow";
import type { NeedsYouNarrativeItem } from "./briefs";

export type NeedsYouRowSource = "live" | "narrative";

export interface NeedsYouRowData {
  id: string;
  source: NeedsYouRowSource;
  title: string;
  description: string | null;
  nextStep: string | null;
  category: string;
  priority: "high" | "normal";
  taskIds: string[];
  href: string | null;
}

// Live items carry no priority field (sync-paperclip-pending doesn't read
// one off Paperclip yet) — money items default to "high" since an overdue
// invoice or a pending signature is already costing something, everything
// else defaults to "normal".
function livePriority(item: NeedsYouItem): "high" | "normal" {
  return item.bucket === "money" ? "high" : "normal";
}

export function liveItemToRow(item: NeedsYouItem): NeedsYouRowData {
  return {
    id: item.id,
    source: "live",
    title: item.title,
    description: item.kind,
    nextStep: null,
    category: item.kind,
    priority: livePriority(item),
    taskIds: item.issue_identifier ? [item.issue_identifier] : [],
    href: item.issue_url,
  };
}

export function narrativeItemToRow(item: NeedsYouNarrativeItem): NeedsYouRowData {
  return {
    id: item.id,
    source: "narrative",
    title: item.title,
    description: item.body ?? null,
    nextStep: item.next_step ?? null,
    category: item.category,
    priority: item.priority ?? "normal",
    taskIds: item.task_ids ?? [],
    href: null,
  };
}

/** Live cards first (closer to "now"), then the brief's own narrative rows. */
export function buildNeedsYouRows(
  live: NeedsYouItem[] | null,
  narrative: NeedsYouNarrativeItem[] | null | undefined,
): NeedsYouRowData[] {
  return [
    ...(live ?? []).map(liveItemToRow),
    ...(narrative ?? []).map(narrativeItemToRow),
  ];
}
