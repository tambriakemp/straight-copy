// CRE-388: the brief's own markdown "Needs You" section is scratched —
// its structured rows (Brief.needs_you) merge into the same list as the
// live Paperclip-pending cards (useNeedsYouNow), so there is only one
// "Needs you now" list on the Today page. Pure/no React here on purpose,
// same house style as issueLinks.ts, so the merge is unit-testable without
// rendering.
//
// CRE-391 round 2: the brief's "Awaiting your approval" and "In flight /
// stuck" cards are scratched too — their rows merge in here as well, each
// carrying its own filter tag ("approvals" / "in_flight") alongside the
// live rows' agents/clients/money bucket. Every row also now carries its
// own precomputed `marker` (previously spread across three different
// per-card dot/icon dictionaries — PRIORITY_COLOR in Today.tsx, STATUS_
// MARKER in InFlightCard, waitingBadge in ApprovalsCard) so Today.tsx can
// render any row the same way without caring which source it came from.
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Clock, Lock } from "lucide-react";
import type { NeedsYouItem, NeedsYouBucket } from "./needsYouNow";
import type { ApprovalCard, InFlightItem, InFlightStatus, NeedsYouNarrativeItem } from "./briefs";

export type NeedsYouRowSource = "live" | "narrative" | "approval" | "in_flight";

// "all" isn't a row tag, it's the filter pseudo-value for "no filter" —
// kept out of this union on purpose so a mis-tagged row can't claim it.
export type NeedsYouFilterTag = NeedsYouBucket | "in_flight";

export type RowMarker =
  | { kind: "dot"; color: string; label: string }
  | { kind: "icon"; icon: LucideIcon; color: string; label: string };

export interface NeedsYouRowData {
  id: string;
  source: NeedsYouRowSource;
  tag: NeedsYouFilterTag;
  marker: RowMarker;
  title: string;
  description: string | null;
  nextStep: string | null;
  category: string;
  taskIds: string[];
  href: string | null;
}

const PRIORITY_COLOR = { high: "#ea580c", normal: "#eab308" };

// Live items carry no priority field (sync-paperclip-pending doesn't read
// one off Paperclip yet) — money items default to "high" since an overdue
// invoice or a pending signature is already costing something, everything
// else defaults to "normal".
function liveMarker(item: NeedsYouItem): RowMarker {
  const high = item.bucket === "money";
  return { kind: "dot", color: high ? PRIORITY_COLOR.high : PRIORITY_COLOR.normal, label: high ? "High priority" : "Normal priority" };
}

export function liveItemToRow(item: NeedsYouItem): NeedsYouRowData {
  return {
    id: item.id,
    source: "live",
    tag: item.bucket,
    marker: liveMarker(item),
    title: item.title,
    description: item.kind,
    nextStep: null,
    category: item.kind,
    taskIds: item.issue_identifier ? [item.issue_identifier] : [],
    href: item.issue_url,
  };
}

function narrativeMarker(item: NeedsYouNarrativeItem): RowMarker {
  const high = item.priority === "high";
  return { kind: "dot", color: high ? PRIORITY_COLOR.high : PRIORITY_COLOR.normal, label: high ? "High priority" : "Normal priority" };
}

export function narrativeItemToRow(item: NeedsYouNarrativeItem): NeedsYouRowData {
  return {
    id: item.id,
    source: "narrative",
    // CRE-391: defaults to "agents" until the ingest routine sends `tag` —
    // see the NeedsYouTag comment in briefs.ts.
    tag: item.tag ?? "agents",
    marker: narrativeMarker(item),
    title: item.title,
    description: item.body ?? null,
    nextStep: item.next_step ?? null,
    category: item.category,
    taskIds: item.task_ids ?? [],
    href: null,
  };
}

// CRE-366 §2b, moved from ApprovalsCard's own waitingBadge: red/pink
// whenever a deadline is set (regardless of how far off — overdue gets its
// own label), amber once it's been waiting 2+ days with no deadline,
// neutral otherwise.
function approvalMarker(approval: ApprovalCard): RowMarker {
  const now = Date.now();
  if (approval.deadline) {
    const overdue = new Date(approval.deadline).getTime() <= now;
    return { kind: "dot", color: "#db2777", label: overdue ? "Overdue" : "Has a deadline" };
  }
  if (approval.waiting_since) {
    const days = Math.max(0, Math.floor((now - new Date(approval.waiting_since).getTime()) / 86_400_000));
    if (days >= 2) return { kind: "dot", color: "#d97706", label: `Waiting ${days} days` };
  }
  return { kind: "dot", color: "#9ca3af", label: "New" };
}

// The old ApprovalsCard rendered `options` as pill chips under the body;
// NeedsYouRow has no chip slot, so they fold into the next-step line.
function approvalNextStep(approval: ApprovalCard): string | null {
  return approval.options?.length ? `Choose: ${approval.options.join(", ")}` : null;
}

export function approvalItemToRow(approval: ApprovalCard): NeedsYouRowData {
  return {
    id: approval.id,
    source: "approval",
    tag: "approvals",
    marker: approvalMarker(approval),
    title: approval.title,
    description: approval.context ?? null,
    nextStep: approvalNextStep(approval),
    category: approval.project,
    taskIds: approval.task_ids ?? [],
    href: approval.link ?? null,
  };
}

// Moved from InFlightCard's own STATUS_MARKER dict.
const IN_FLIGHT_MARKER: Record<InFlightStatus, RowMarker> = {
  stuck: { kind: "icon", icon: AlertTriangle, color: "#dc2626", label: "Stuck" },
  blocked: { kind: "icon", icon: Lock, color: "#d97706", label: "Blocked" },
  in_progress: { kind: "icon", icon: Clock, color: "#4f46e5", label: "In progress" },
};

export function inFlightItemToRow(item: InFlightItem): NeedsYouRowData {
  return {
    id: item.id,
    source: "in_flight",
    tag: "in_flight",
    marker: IN_FLIGHT_MARKER[item.status],
    title: item.title,
    description: item.body ?? null,
    nextStep: null,
    category: item.category,
    taskIds: item.task_ids ?? [],
    href: null,
  };
}

/** Live cards first (closer to "now"), then approvals, then in-flight, then
 *  the brief's own narrative rows. Every arg is optional/nullable so a
 *  still-loading or data-less source just contributes no rows. */
export function buildNeedsYouRows(args: {
  live?: NeedsYouItem[] | null;
  narrative?: NeedsYouNarrativeItem[] | null;
  approvals?: ApprovalCard[] | null;
  inFlight?: InFlightItem[] | null;
}): NeedsYouRowData[] {
  return [
    ...(args.live ?? []).map(liveItemToRow),
    ...(args.approvals ?? []).map(approvalItemToRow),
    ...(args.inFlight ?? []).map(inFlightItemToRow),
    ...(args.narrative ?? []).map(narrativeItemToRow),
  ];
}
