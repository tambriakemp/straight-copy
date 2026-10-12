// The feedback board's own rules: which pages it lists, which comments
// belong to which page, and what the filters do.
//
// Pure, because the thing that goes wrong here is a comment attached to
// the wrong page or quietly not shown at all — and a board with a comment
// missing looks exactly like a board with nothing to say. A client who
// left feedback and sees it vanish stops leaving feedback.

export type FeedbackStatus = "open" | "in_progress" | "resolved";

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  open: "Open", in_progress: "In progress", resolved: "Resolved",
};
export const STATUS_CLASS: Record<FeedbackStatus, string> = {
  open: "cv-s-open", in_progress: "cv-s-prog", resolved: "cv-s-done",
};
/** Clicking a status cycles it, which is the canvas's one-click change. */
export const NEXT_STATUS: Record<FeedbackStatus, FeedbackStatus> = {
  open: "in_progress", in_progress: "resolved", resolved: "open",
};

/**
 * `status` is free text in the database and was written by two different
 * paths before this page existed, so anything unrecognised reads as open
 * — the state that keeps a comment visible. Defaulting the other way
 * would hide real feedback behind the resolved filter.
 */
export function normaliseStatus(raw: string | null | undefined): FeedbackStatus {
  const s = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "resolved" || s === "done" || s === "closed") return "resolved";
  if (s === "in_progress" || s === "progress" || s === "doing") return "in_progress";
  return "open";
}

export interface BoardPage {
  /** Stable key: the preview project and the path within it. */
  key: string;
  previewId: string;
  previewName: string;
  path: string;
  label: string;
  group: string | null;
  external: boolean;
  visibleToClient: boolean;
  order: number;
}

export interface BoardComment {
  id: string;
  project_id: string;
  page_path: string;
  pin_number: number;
  x_pct: number;
  y_pct: number;
  author_name: string | null;
  body: string;
  status: string;
  created_at: string;
  replyCount?: number;
}

/**
 * What a page is called on screen.
 *
 * The file name with its extension and folder stripped, because
 * "Design concepts / Magna Tax Relief About Us.html" is three facts in
 * one line and the rail prints a hundred of them. The group is a heading
 * above the page, not a prefix on it, so it is said once per group
 * instead of once per row.
 */
export function pageLabel(p: BoardPage): string {
  const raw = (p.label || "").trim() || p.path;
  const base = raw.split("/").pop() ?? raw;
  const stripped = base.replace(/\.(html?|png|jpe?g|webp|gif|svg)$/i, "").trim();
  return stripped || base || p.path;
}

/** The folder a page files under. Never blank — "Ungrouped" is a folder. */
export function groupOf(p: BoardPage): string {
  return (p.group || "").trim() || p.previewName || "Ungrouped";
}

/** "Image" or "HTML page" — the second line on a page row. */
export function pageKind(p: BoardPage): string {
  if (p.external) return "Linked page";
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(p.path) ? "Image" : "HTML page";
}

/**
 * The long form, group included. Kept for the places that name a page
 * with no folder heading above it to give it context.
 */
export function pageTitle(p: BoardPage): string {
  return [p.group || p.previewName, p.label || p.path].filter(Boolean).join(" / ");
}

/**
 * Pages under their folder heading, in the order sortPages put them.
 *
 * One list rather than a map so the order survives: a Map keyed by group
 * reorders on insertion and the rail would shuffle its folders every
 * time a page moved between them.
 */
export function foldersOf(pages: BoardPage[]): Array<{ name: string; pages: BoardPage[] }> {
  const out: Array<{ name: string; pages: BoardPage[] }> = [];
  for (const p of sortPages(pages)) {
    const name = groupOf(p);
    const last = out[out.length - 1];
    if (last && last.name === name) last.pages.push(p);
    else out.push({ name, pages: [p] });
  }
  return out;
}

/** Every group name in use, for the "Add to group" picker. */
export function groupNames(pages: BoardPage[]): string[] {
  const seen = new Set<string>();
  for (const p of pages) {
    const g = (p.group || "").trim();
    if (g) seen.add(g);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

export function pageKey(previewId: string, path: string): string {
  return `${previewId}:${path}`;
}

/**
 * Pages in the order the board lists them: by group, then by the order
 * index someone set, then by label. Hidden-from-client pages are kept —
 * the admin side of the board shows everything, and the Viewing-as-Client
 * toggle is what hides them.
 */
export function sortPages(pages: BoardPage[]): BoardPage[] {
  return [...pages].sort((a, b) =>
    (a.group ?? "").localeCompare(b.group ?? "")
    || a.order - b.order
    || a.label.localeCompare(b.label));
}

/** What the client would see: only the pages marked visible to them. */
export function visibleTo(pages: BoardPage[], asClient: boolean): BoardPage[] {
  return asClient ? pages.filter((p) => p.visibleToClient) : pages;
}

export interface PageBucket { page: BoardPage; comments: BoardComment[] }

/**
 * Comments filed under their page.
 *
 * Matched on preview project AND path, not path alone: two preview
 * projects under one client project routinely both have an "index.html",
 * and matching on the path would show the desktop comments on the mobile
 * page and double the count on both.
 *
 * Every page appears, including empty ones — "0 comments" on a page is
 * information, and the canvas prints it.
 */
export function bucketByPage(pages: BoardPage[], comments: BoardComment[]): PageBucket[] {
  const buckets = new Map<string, PageBucket>();
  for (const page of sortPages(pages)) buckets.set(page.key, { page, comments: [] });
  for (const c of comments) {
    const b = buckets.get(pageKey(c.project_id, c.page_path));
    if (b) b.comments.push(c);
  }
  for (const b of buckets.values()) b.comments.sort((x, y) => x.pin_number - y.pin_number);
  return [...buckets.values()];
}

/**
 * Comments that match the search and the status filter.
 *
 * Resolved ones are out unless asked for: a board that keeps showing
 * everything ever settled stops being a list of what is left to do, which
 * is the only reason to open it.
 */
export function filterComments(
  comments: BoardComment[],
  { query = "", status = "all", showResolved = false }:
    { query?: string; status?: FeedbackStatus | "all"; showResolved?: boolean } = {},
): BoardComment[] {
  const q = query.trim().toLowerCase();
  return comments.filter((c) => {
    const s = normaliseStatus(c.status);
    if (status !== "all" && s !== status) return false;
    // An explicit "show me resolved" filter beats the default hiding —
    // otherwise picking Resolved from the filter returns nothing.
    if (s === "resolved" && !showResolved && status !== "resolved") return false;
    if (!q) return true;
    return c.body.toLowerCase().includes(q)
      || (c.author_name ?? "").toLowerCase().includes(q)
      || String(c.pin_number) === q;
  });
}

/** What the Status dropdown offers. */
export type StatusFilter = FeedbackStatus | "all";

export const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Status: all" },
  { value: "open", label: "Status: open" },
  { value: "in_progress", label: "Status: in progress" },
  { value: "resolved", label: "Status: resolved" },
];

/**
 * What the Status dropdown means, as arguments to filterComments.
 *
 * Named rather than inlined because the mapping is not obvious and both
 * boards have to make the same one: `showResolved` is always true here,
 * since the dropdown is now the only thing deciding what is shown, and
 * leaving it false would make "Status: all" quietly mean "all except
 * resolved" — a filter that lies about its own name.
 */
export function statusArgs(s: StatusFilter): { status: StatusFilter; showResolved: boolean } {
  return { status: s, showResolved: true };
}

/** How many are still outstanding, across everything shown. */
export function openCount(comments: BoardComment[]): number {
  return comments.filter((c) => normaliseStatus(c.status) !== "resolved").length;
}

/** Initials for the comment avatar. "Guest" and empty both get a dash. */
export function authorInitials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "—";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Where a click landed, as percentages of the rendered page.
 *
 * Percentages rather than pixels because the page is rendered at whatever
 * width the window gives it and re-rendered at another width tomorrow —
 * a pin stored in pixels drifts off the thing it was pointing at.
 */
export function clickToPct(
  clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number },
): { x_pct: number; y_pct: number } {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  return {
    x_pct: Number(clamp(((clientX - rect.left) / (rect.width || 1)) * 100).toFixed(2)),
    y_pct: Number(clamp(((clientY - rect.top) / (rect.height || 1)) * 100).toFixed(2)),
  };
}

// ---------------------------------------------------------------------
// Approvals, and the activity feed
// ---------------------------------------------------------------------

export type PageApproval = "approved" | "changes_requested" | "pending";

export const APPROVAL_LABEL: Record<PageApproval, string> = {
  approved: "Approved", changes_requested: "Changes requested", pending: "Not reviewed",
};
export const APPROVAL_CLASS: Record<PageApproval, string> = {
  approved: "cv-s-done", changes_requested: "cv-s-open", pending: "cv-chip--gray",
};

export interface ApprovalRow { path: string; project_id: string; approved_at: string }
export interface ApprovalEvent {
  id: string;
  project_id: string;
  path: string;
  action: string;
  note: string | null;
  approver_name: string | null;
  created_at: string;
}

/**
 * Where a page stands.
 *
 * An approval row is the fact; events are the history. A page can have
 * been approved, sent back, and approved again — only the row says
 * whether it is approved NOW, which is why this does not try to read the
 * state out of the last event.
 *
 * "Changes requested" is the in-between: not approved, and somebody said
 * why. Without it a page that was rejected looks identical to one nobody
 * has opened.
 */
export function approvalFor(
  pageKeyStr: string,
  approvals: Map<string, ApprovalRow>,
  lastEvent: Map<string, ApprovalEvent>,
): { state: PageApproval; note: string | null; who: string | null; at: string | null } {
  const row = approvals.get(pageKeyStr);
  if (row) return { state: "approved", note: null, who: null, at: row.approved_at };
  const ev = lastEvent.get(pageKeyStr);
  if (ev && ev.action === "changes_requested") {
    return { state: "changes_requested", note: ev.note, who: ev.approver_name, at: ev.created_at };
  }
  return { state: "pending", note: null, who: null, at: null };
}

export interface ActivityItem {
  id: string;
  at: string;
  who: string;
  what: string;
  detail?: string | null;
  page: string;
  tone: "green" | "amber" | "blue" | "gray";
}

/**
 * One feed from two sources, newest first.
 *
 * Comments and approvals are separate tables with nothing joining them,
 * but to the person reading this they are the same stream: things that
 * happened to this project's pages. Shown apart, you cannot tell whether
 * the client approved a page before or after leaving the comment that
 * contradicts it.
 */
export function buildActivity(
  events: ApprovalEvent[],
  comments: BoardComment[],
  titleFor: (previewId: string, path: string) => string,
): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const e of events) {
    const what = e.action === "approve" ? "approved this page"
      : e.action === "changes_requested" ? "asked for changes"
        : e.action === "unapprove" ? "withdrew their approval"
          : e.action;
    out.push({
      id: `e:${e.id}`, at: e.created_at, who: e.approver_name || "Someone",
      what, detail: e.note, page: titleFor(e.project_id, e.path),
      tone: e.action === "approve" ? "green" : e.action === "changes_requested" ? "amber" : "gray",
    });
  }
  for (const c of comments) {
    out.push({
      id: `c:${c.id}`, at: c.created_at, who: c.author_name || "Guest",
      what: `left comment ${c.pin_number}`, detail: c.body,
      page: titleFor(c.project_id, c.page_path), tone: "blue",
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
