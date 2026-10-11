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
  /**
   * Decide-only, and the reason the Today page can split this list in two.
   *
   * An approval is the one row kind where the agent is holding a named set
   * of answers open — "Use defaults" / "Answer each", "Merge" / "Review
   * first". CRE-391 folded those into the next-step line as "Choose: a, b"
   * because the merged row had nowhere to put them; the Admin Journeys
   * canvas puts them back as real buttons, so they survive as data again.
   */
  options?: string[];
  waitingSince?: string | null;
  deadline?: string | null;
  /**
   * CRE-393: which decision-button set a Decide card should render, and
   * (for "merge") what to merge. See docs/decide-contract.md for the full
   * agent-side contract — this is just the subset a row needs on top of
   * `options` to act on a pick instead of just displaying it.
   */
  actionType?: string | null;
  repo?: string | null;
  prNumber?: number | null;
  branch?: string | null;
  baseBranch?: string | null;
  /**
   * CRE-393 §A.4: whether this Do row is Bree's own to check off. A Decide
   * row never reaches this — Decide ends in a button, not a checkbox (see
   * DecideCard's own comment) — so this only matters for Do rows; it
   * defaults true and goes false for rows that belong to an agent instead
   * (a stalled-but-agent-owned Paperclip issue, or an in-flight status row)
   * where checking it off would falsely tell that agent its work is done.
   */
  checkable: boolean;
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
    // Not item.kind: `category` below already renders it as the row's
    // project tag, so setting it here too printed "Interaction" as a pill
    // and "interaction" as a line of body text directly under it.
    description: null,
    nextStep: null,
    category: item.kind,
    taskIds: item.issue_identifier ? [item.issue_identifier] : [],
    href: item.issue_url,
    checkable: item.checkable,
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
    // A narrative row is Ara writing a line for Bree by hand — there is no
    // agent on the other end of it to falsely mark done.
    checkable: true,
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

export function approvalItemToRow(approval: ApprovalCard): NeedsYouRowData {
  return {
    id: approval.id,
    source: "approval",
    tag: "approvals",
    marker: approvalMarker(approval),
    title: approval.title,
    description: approval.context ?? null,
    // No longer "Choose: a, b" in the next-step line — the Decide card
    // renders `options` as buttons, so saying it twice would read as two
    // different instructions.
    nextStep: null,
    category: approval.project,
    taskIds: approval.task_ids ?? [],
    href: approval.link ?? null,
    options: approval.options ?? [],
    waitingSince: approval.waiting_since ?? null,
    deadline: approval.deadline ?? null,
    actionType: approval.action_type ?? null,
    repo: approval.repo ?? null,
    prNumber: approval.pr_number ?? null,
    branch: approval.branch ?? null,
    baseBranch: approval.base_branch ?? null,
    // Decide never shows a checkbox regardless (see DecideCard) — kept
    // true here only so the field means the same thing on every row.
    checkable: true,
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
    // CRE-393 §A.4: an in-flight row is an agent's own status (stuck /
    // blocked / in progress), never Bree's task — no checkbox.
    checkable: false,
  };
}

// CRE-393 §A.3: the same Paperclip issue can legitimately reach this list
// twice — once as a live sync row and once as a brief's own narrative or
// approval line about the same card (CRE-355 did exactly this). Collapse
// by first task id (falling back to the row's own id for rows with none),
// keeping the most authoritative source: an approval IS the decision
// surface for that issue, so it always wins and the same id can never also
// sit in Do; a live sync row is the most structured/up-to-date Do
// description; in-flight and narrative are editorial and yield to either.
const SOURCE_PRIORITY: Record<NeedsYouRowSource, number> = {
  approval: 0, live: 1, in_flight: 2, narrative: 3,
};

// CRE-393 round 2: Bree saw CRE-354 and CRE-372 each render twice. The two
// sources that can both carry the same issue (a live sync row and a
// brief's narrative/approval line about it — see the comment above) don't
// always agree on the exact string: Ara's narrative ingest and the live
// sync's own `issue_identifier` have disagreed on case/whitespace before.
// Normalizing the key is a one-line fix for that whole class of false
// non-match, instead of a one-off patch for these two issues.
function dedupeKey(row: NeedsYouRowData): string {
  const task = row.taskIds[0];
  return task ? task.trim().toUpperCase() : row.id;
}

function dedupeRows(rows: NeedsYouRowData[]): NeedsYouRowData[] {
  const kept = new Map<string, NeedsYouRowData>();
  const order: string[] = [];
  for (const row of rows) {
    const key = dedupeKey(row);
    const existing = kept.get(key);
    if (!existing) {
      kept.set(key, row);
      order.push(key);
    } else if (SOURCE_PRIORITY[row.source] < SOURCE_PRIORITY[existing.source]) {
      kept.set(key, row);
    }
  }
  return order.map((key) => kept.get(key)!);
}

/** Live cards first (closer to "now"), then approvals, then in-flight, then
 *  the brief's own narrative rows. Every arg is optional/nullable so a
 *  still-loading or data-less source just contributes no rows. Result is
 *  deduped by Paperclip issue id — see dedupeRows above. */
/**
 * Today's two lists.
 *
 * Decide is where an agent is stopped until you answer; Do is your own
 * work. The split is by SOURCE, not by tag: an approval is the only kind
 * that carries a set of answers someone is waiting on, and everything else
 * — a Paperclip card, a narrative line, something stuck — is a thing you
 * go and do. Splitting by tag instead would put a stuck build in Decide
 * just because nobody has touched it.
 *
 * Order is preserved within each list, so whatever the brief put first
 * stays first.
 */
export function splitTodayRows(rows: NeedsYouRowData[]): {
  decide: NeedsYouRowData[];
  todo: NeedsYouRowData[];
} {
  const decide: NeedsYouRowData[] = [];
  const todo: NeedsYouRowData[] = [];
  for (const row of rows) (row.source === "approval" ? decide : todo).push(row);
  return { decide, todo };
}

export function buildNeedsYouRows(args: {
  live?: NeedsYouItem[] | null;
  narrative?: NeedsYouNarrativeItem[] | null;
  approvals?: ApprovalCard[] | null;
  inFlight?: InFlightItem[] | null;
}): NeedsYouRowData[] {
  return dedupeRows([
    ...(args.live ?? []).map(liveItemToRow),
    ...(args.approvals ?? []).map(approvalItemToRow),
    ...(args.inFlight ?? []).map(inFlightItemToRow),
    ...(args.narrative ?? []).map(narrativeItemToRow),
  ]);
}
