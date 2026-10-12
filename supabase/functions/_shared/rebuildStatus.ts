// CRE-413: shared Paperclip-issue-status -> prospect_approvals.rebuild_status
// mapping, used by both rebuild-status-webhook (receiver, for a future
// proactive push) and sync-rebuild-status (the hourly poll that's the real,
// self-sufficient fallback — see the CRE-413 migration's header comment for
// why there's no native Paperclip webhook to rely on for this).
export type RebuildStatus = "queued" | "rebuilding" | "ready_for_review" | "stuck";

export interface RebuildStatusUpdate {
  rebuild_status: RebuildStatus;
  rebuild_stuck_reason: string | null;
}

// `alreadyReadyForReview` is true when prospect-approvals-sync's push action
// has already flipped this row to 'ready_for_review' (a new version exists).
// A 'done'/'cancelled' Paperclip issue that never resulted in a pushed
// rebuilt version is a real anomaly (Camille closed it without resubmitting,
// or it was cancelled outright) — fail loud with 'stuck' rather than
// silently leaving the row's last known status in place.
export function mapIssueStatus(
  issueStatus: string,
  opts: { alreadyReadyForReview: boolean; blockedReason: string | null },
): RebuildStatusUpdate {
  if (opts.alreadyReadyForReview) {
    return { rebuild_status: "ready_for_review", rebuild_stuck_reason: null };
  }
  switch (issueStatus) {
    case "todo":
      return { rebuild_status: "queued", rebuild_stuck_reason: null };
    case "in_progress":
    case "in_review":
      return { rebuild_status: "rebuilding", rebuild_stuck_reason: null };
    case "blocked":
      return {
        rebuild_status: "stuck",
        rebuild_stuck_reason: opts.blockedReason ?? "Rebuild issue is blocked — check the issue thread.",
      };
    case "done":
      return {
        rebuild_status: "stuck",
        rebuild_stuck_reason: "Rebuild issue was closed without a rebuilt version ever being pushed — check with Camille.",
      };
    case "cancelled":
      return { rebuild_status: "stuck", rebuild_stuck_reason: "Rebuild issue was cancelled." };
    default:
      return { rebuild_status: "rebuilding", rebuild_stuck_reason: null };
  }
}
