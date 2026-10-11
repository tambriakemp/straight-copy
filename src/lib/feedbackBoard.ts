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

/** "Desktop / Home" — the heading the canvas groups comments under. */
export function pageTitle(p: BoardPage): string {
  return [p.group || p.previewName, p.label || p.path].filter(Boolean).join(" / ");
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
