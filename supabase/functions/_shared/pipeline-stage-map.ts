// Pure mapping from the live "Cre8 Prospect" SureContact pipeline (8 stages,
// after the CRE-332 renames) to the admin Pipeline page's board columns.
// Bree approved this mapping Oct 7, 2026: Demo Scheduled folds into Intake,
// In Negotiation folds into Proposal sent with a "Revised" flag, Lost is
// hidden by default (filterable). Won is labeled "Won" (not "Deposit paid")
// per Bree's Oct 7 11:41 PM CT correction — SureContact doesn't allow
// deleting its Won stage, so the admin label must match it exactly.
//
// No network call in this file on purpose — it only turns a stage position
// into a column key, so it can be unit tested without SureContact access.
// The live stage->uuid->position lookup lives in surecontact-deals.ts.

export type BoardColumnKey = "lead" | "intake" | "proposalSent" | "signed" | "won" | "lost";

export interface BoardColumnDef {
  key: BoardColumnKey;
  label: string;
  /** Live pipeline position(s) (0-based) that fold into this column. */
  positions: number[];
}

export const BOARD_COLUMNS: BoardColumnDef[] = [
  { key: "lead", label: "Lead", positions: [0] },
  { key: "intake", label: "Intake", positions: [1, 2] },
  { key: "proposalSent", label: "Proposal sent", positions: [3, 4] },
  { key: "signed", label: "Signed", positions: [5] },
  { key: "won", label: "Won", positions: [6] },
  { key: "lost", label: "Lost", positions: [7] },
];

/** Position 4 is "In Negotiation" — CRE-286 only ever moves a deal there
 *  when a revised proposal replaces an older one, so it's a flag on the
 *  Proposal sent card rather than its own column. */
const REVISED_POSITION = 4;

export function columnForPosition(position: number): BoardColumnKey | null {
  return BOARD_COLUMNS.find((c) => c.positions.includes(position))?.key ?? null;
}

export function isRevisedFlag(position: number): boolean {
  return position === REVISED_POSITION;
}

export function columnLabel(key: BoardColumnKey): string {
  return BOARD_COLUMNS.find((c) => c.key === key)?.label ?? key;
}

/** Visible columns in board order, Lost excluded — it's shown separately
 *  behind a "Show lost" toggle per Bree's approved mapping. */
export const VISIBLE_BOARD_COLUMNS = BOARD_COLUMNS.filter((c) => c.key !== "lost");
