// Turning the client directory into the cards the Clients list draws.
//
// Pure and on its own because the three filters are judgement calls and
// none of them shows its working on screen. What "Active" excludes. What
// "Needs you" means when the page is one tab away from everything. Which
// of two names is the heading when a client has both a person and a
// business. A card renders the same whichever answer you picked.

import { avatarFor, type AvatarStyle } from "@/lib/avatar";
import { projectTypeStyle, type ProjectTypeStyle } from "@/lib/projectType";
import { countsFor, sumCounts, type TaskCounts } from "@/lib/taskCounts";
import type { DirectoryClient, DirectoryProject } from "@/lib/useClientDirectory";
import type { ChipTone } from "@/lib/pipelineTone";

export type ClientFilter = "active" | "needs_you" | "archived";

export interface ClientProjectRow {
  id: string;
  name: string;
  type: ProjectTypeStyle;
  counts: TaskCounts;
}

export interface ClientCardRow {
  id: string;
  /** The heading: the business if there is one, else the person. */
  name: string;
  /** The line under it: the person, and when they came on. */
  who: string;
  avatar: AvatarStyle;
  status: { label: string; tone: ChipTone };
  /** At most three; the rest are counted in `extraProjects`. */
  projects: ClientProjectRow[];
  extraProjects: number;
  totals: TaskCounts;
  needsYou: boolean;
}

/** How many projects a card lists before it says "+ N more". */
const SHOWN_PROJECTS = 3;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The heading is the business, the line under it is the person.
 *
 * The old roster led with the contact name, on the reasoning that the
 * client is a person. On a card the business is what you are looking for —
 * you go to Menovia, and Dr. Kahin is who you talk to there — and a client
 * running three businesses appeared three times under one person's name.
 * Both are printed either way; this only decides which is the heading.
 */
export function headingFor(c: Pick<DirectoryClient, "business_name" | "contact_name">): string {
  // Trimmed before the fallback, not after: a business name of "  " is not
  // a business name, and chaining on the raw value picks it and then
  // trims it away to nothing.
  return (c.business_name ?? "").trim() || (c.contact_name ?? "").trim() || "Untitled";
}

function subtitleFor(c: DirectoryClient): string {
  const since = fmtDate(c.created_at);
  // Only when the person is not already the heading — otherwise the card
  // prints "Mary Sims / Mary Sims · since May 5".
  const person = headingFor(c) === (c.contact_name ?? "").trim() ? "" : (c.contact_name ?? "").trim();
  return [person, since && `since ${since}`].filter(Boolean).join(" · ");
}

export function buildClientRows(
  clients: DirectoryClient[],
  projectsByClient: Map<string, DirectoryProject[]>,
  counts: Map<string, TaskCounts>,
): ClientCardRow[] {
  return clients.map((c) => {
    const all = projectsByClient.get(c.id) ?? [];
    const withCounts: ClientProjectRow[] = all.map((p) => ({
      id: p.id,
      name: p.name,
      type: projectTypeStyle(p.type),
      counts: countsFor(counts, p.id),
    }));
    const totals = sumCounts(withCounts.map((p) => p.counts));
    return {
      id: c.id,
      name: headingFor(c),
      who: subtitleFor(c),
      avatar: avatarFor(headingFor(c), c.internal),
      status: c.archived
        ? { label: "Archived", tone: "gray" as const }
        : c.internal
          ? { label: "Internal", tone: "gray" as const }
          : { label: "Active", tone: "green" as const },
      projects: withCounts.slice(0, SHOWN_PROJECTS),
      extraProjects: Math.max(0, withCounts.length - SHOWN_PROJECTS),
      totals,
      // Something has stopped and is waiting on a person: a task in review,
      // or one that is blocked. Not "has open tasks" — on this page that
      // would be every client with any work at all, which is no filter.
      needsYou: withCounts.some((p) => p.counts.needsReview > 0 || p.counts.blocked > 0),
    };
  });
}

/** Case-insensitive match on the client's own names and its projects'. */
export function matchesSearch(row: ClientCardRow, query: string, allProjectNames: string[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (row.name.toLowerCase().includes(q)) return true;
  if (row.who.toLowerCase().includes(q)) return true;
  // Every project, not only the three the card shows — otherwise searching
  // for a project buried under "+ 6 more" finds nothing.
  return allProjectNames.some((n) => n.toLowerCase().includes(q));
}

export function applyFilter(rows: ClientCardRow[], filter: ClientFilter): ClientCardRow[] {
  // Archived is its own tab, so it is excluded from the other two rather
  // than showing up greyed out in all three.
  const live = rows.filter((r) => r.status.label !== "Archived");
  if (filter === "archived") return rows.filter((r) => r.status.label === "Archived");
  if (filter === "needs_you") return live.filter((r) => r.needsYou);
  return live;
}
