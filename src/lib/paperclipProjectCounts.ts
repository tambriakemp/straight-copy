// Overlaying Paperclip-sourced counts onto the Portal's own project_tasks
// tally — CRE-394. A project's bar keeps reading project_tasks exactly as
// before until two things are both true: it has a `paperclip_project_id`,
// and the hourly sync has written it a row with at least one task on it.
// A freshly-linked, still-empty Paperclip project must not zero out a
// count that is still the only real record of the work — that was Bree's
// call on CRE-394: old projects keep their Portal number until their
// Paperclip project actually has tasks, then the count comes from there.
//
// Both the column and the table were added by a migration run directly
// in the Supabase SQL editor, not through Lovable, so the generated
// Database type won't know about either until Lovable's own agent next
// touches this schema. Reached through an explicitly untyped query the
// same way @/lib/missingColumn documents reaching a column one migration
// ahead of codegen — and, like that helper, every failure here (missing
// column, missing table, a network error) falls back to "nothing
// changes" rather than costing the page its progress bars.
import { supabase } from "@/integrations/supabase/client";
import { isMissingColumn, isMissingRelation, type PostgrestLikeError } from "@/lib/missingColumn";
import { countsFromPaperclip, type PaperclipCountsRow, type TaskCounts } from "@/lib/taskCounts";

interface LooseResult<T> {
  data: T | null;
  error: PostgrestLikeError | null;
}

/** The one cast boundary in this file — see the header comment. */
function untypedFrom<T>(table: string) {
  return (supabase as unknown as {
    from(table: string): {
      select(columns: string): { in(column: string, values: string[]): PromiseLike<LooseResult<T>> };
    };
  }).from(table);
}

/** `client_project_id -> paperclip_project_id`, for whichever of `ids`
 *  has one set. Empty — not thrown — if the column isn't live yet. */
export async function loadPaperclipProjectLinks(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const res = await untypedFrom<Array<{ id: string; paperclip_project_id: string | null }>>("client_projects")
    .select("id, paperclip_project_id")
    .in("id", ids);
  if (res.error) {
    if (!isMissingColumn(res.error)) console.warn("client_projects.paperclip_project_id:", res.error.message);
    return new Map();
  }
  const out = new Map<string, string>();
  for (const row of res.data ?? []) if (row.paperclip_project_id) out.set(row.id, row.paperclip_project_id);
  return out;
}

/** `portalCounts` with any linked, already-synced project's entry
 *  replaced by its Paperclip counts. Returns a new map; never mutates
 *  the one it was given. */
export async function withPaperclipOverlay(
  portalCounts: Map<string, TaskCounts>,
  linked: Map<string, string>,
): Promise<Map<string, TaskCounts>> {
  if (!linked.size) return portalCounts;
  const res = await untypedFrom<Array<PaperclipCountsRow & { client_project_id: string }>>("paperclip_project_task_counts")
    .select("client_project_id, total, open, done, by_status")
    .in("client_project_id", [...linked.keys()]);
  if (res.error) {
    if (!isMissingRelation(res.error)) console.warn("paperclip_project_task_counts:", res.error.message);
    return portalCounts;
  }
  const out = new Map(portalCounts);
  for (const row of res.data ?? []) if (row.total > 0) out.set(row.client_project_id, countsFromPaperclip(row));
  return out;
}
