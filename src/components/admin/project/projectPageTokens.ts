// The project page's design language, read off the canvas rather than guessed.
//
// These are close cousins of the --crm-* tokens but not the same values: the
// canvas uses a slightly warmer ink and a heavier hairline than the admin
// shell, and matching it means saying so once here rather than sprinkling
// near-miss hex codes through four components.
export const T = {
  ink: "rgb(28, 26, 23)",
  panel: "rgb(34, 31, 28)",
  rowActive: "rgb(49, 45, 41)",
  card: "rgb(41, 38, 34)",
  hairline: "1px solid rgba(244, 239, 233, 0.09)",

  text: "rgb(244, 239, 233)",
  text2: "rgb(194, 187, 178)",
  muted: "rgb(154, 147, 138)",
  bronze: "rgb(184, 156, 122)",

  green: "rgb(157, 179, 140)",
  greenBg: "rgba(157, 179, 140, 0.13)",
  amber: "rgb(210, 174, 114)",
  amberBg: "rgba(210, 174, 114, 0.13)",
  clay: "rgb(212, 148, 116)",
  clayBg: "rgba(212, 148, 116, 0.14)",

  serif: "'Cormorant Garamond', Georgia, serif",
  radius: 10,
  radiusSm: 6,
} as const;

/** The three states a preview page can be in, as the canvas names them. */
export type PageState = "approved" | "changes" | "awaiting";

export const PAGE_STATE_STYLE: Record<PageState, { label: string; fg: string; bg: string }> = {
  approved: { label: "Approved", fg: T.green, bg: T.greenBg },
  changes: { label: "Changes", fg: T.amber, bg: T.amberBg },
  awaiting: { label: "Awaiting", fg: T.text2, bg: T.rowActive },
};

/**
 * What a page's pill says.
 *
 * Comments outrank an approval on purpose. A client who approved a page on
 * Monday and asked for a change on Tuesday has not approved it — showing green
 * because the approval row still exists is how a change request goes out the
 * door unbuilt.
 */
export function pageState(opts: { approved: boolean; comments: number }): PageState {
  if (opts.comments > 0) return "changes";
  if (opts.approved) return "approved";
  return "awaiting";
}

/** "2 of 3 approved", or "empty" when a folder holds nothing. */
export function groupSummary(total: number, approved: number): string {
  if (total === 0) return "empty";
  return `${approved} of ${total} approved`;
}

/**
 * Folder name for a page that has none.
 *
 * Every page needs a folder or the tree has a homeless tier, and "Pages" is
 * what an unsorted page is. Named here so the admin list and the client portal
 * cannot disagree about what to call it.
 */
export const UNGROUPED = "Pages";

export function folderOf(groupLabel: string | null | undefined): string {
  const g = (groupLabel ?? "").trim();
  return g || UNGROUPED;
}

/** Money, the way the canvas prints it: whole dollars, no trailing zeros. */
export function money(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
