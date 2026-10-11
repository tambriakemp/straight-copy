// Rolling project_tasks rows up into the numbers the clients and project
// pages print.
//
// Pure and on its own because every one of these counts is a decision, and
// none of them is visible in a screenshot. Which statuses are "open".
// Whether a blocked task is also open (it is — it is not finished, and a
// progress bar that counts it as done is a lie). What a project with no
// tasks at all shows as a percentage. Those are the things that go wrong,
// and they go wrong quietly: the bar still renders.

import type { Database } from "@/integrations/supabase/types";

export type TaskStatus = Database["public"]["Enums"]["project_task_status"];

export interface TaskRow {
  client_project_id: string;
  status: TaskStatus;
}

export interface TaskCounts {
  total: number;
  done: number;
  /** Everything not complete, blocked and needs-review included. */
  open: number;
  blocked: number;
  needsReview: number;
  /** 0–100, rounded. A project with no tasks is 0, not 100. */
  pct: number;
}

export const EMPTY_COUNTS: TaskCounts = {
  total: 0, done: 0, open: 0, blocked: 0, needsReview: 0, pct: 0,
};

function tally(rows: Iterable<TaskStatus>): TaskCounts {
  let total = 0, done = 0, blocked = 0, needsReview = 0;
  for (const status of rows) {
    total++;
    if (status === "complete") done++;
    if (status === "blocked") blocked++;
    if (status === "needs_review") needsReview++;
  }
  return {
    total, done, open: total - done, blocked, needsReview,
    // Floored, not rounded: 344 of 345 must not print as 100%, because
    // 100% is the one number that means "there is nothing left to do".
    pct: total === 0 ? 0 : Math.floor((done / total) * 100),
  };
}

/** Counts per `client_project_id`. Projects with no tasks are absent. */
export function countByProject(rows: TaskRow[]): Map<string, TaskCounts> {
  const byProject = new Map<string, TaskStatus[]>();
  for (const row of rows) {
    const list = byProject.get(row.client_project_id) ?? [];
    list.push(row.status);
    byProject.set(row.client_project_id, list);
  }
  const out = new Map<string, TaskCounts>();
  for (const [id, statuses] of byProject) out.set(id, tally(statuses));
  return out;
}

/** One project's counts, or zeroes — never undefined, so callers cannot
 *  render "NaN%" for a project nobody has written a task for yet. */
export function countsFor(counts: Map<string, TaskCounts>, projectId: string): TaskCounts {
  return counts.get(projectId) ?? EMPTY_COUNTS;
}

/** The sum across a set of projects, for a client card or the page totals. */
export function sumCounts(all: Iterable<TaskCounts>): TaskCounts {
  let total = 0, done = 0, blocked = 0, needsReview = 0;
  for (const c of all) {
    total += c.total; done += c.done; blocked += c.blocked; needsReview += c.needsReview;
  }
  return {
    total, done, open: total - done, blocked, needsReview,
    pct: total === 0 ? 0 : Math.floor((done / total) * 100),
  };
}

/** A row from `paperclip_project_task_counts` — CRE-394. Synced hourly
 *  from the Paperclip board for any client_project with a
 *  `paperclip_project_id`; absent until the first sync after linking. */
export interface PaperclipCountsRow {
  total: number;
  open: number;
  done: number;
  /** Count per Paperclip issue status (`backlog`, `todo`, `in_progress`,
   *  `in_review`, `done`, `blocked`, `cancelled`). */
  by_status: Record<string, number>;
}

/** Paperclip's `blocked` and `in_review` are this page's `blocked` and
 *  `needsReview` — the two states "Needs you" watches for. */
export function countsFromPaperclip(row: PaperclipCountsRow): TaskCounts {
  return {
    total: row.total,
    done: row.done,
    open: row.open,
    blocked: row.by_status.blocked ?? 0,
    needsReview: row.by_status.in_review ?? 0,
    pct: row.total === 0 ? 0 : Math.floor((row.done / row.total) * 100),
  };
}
