// What the Pipeline page's stage strip and deal cards actually say.
//
// Pure, because these are the judgement calls and none of them shows its
// working: which figure is the big one in a stage tile, what a stage with
// deals but no money on them reads as, and how long a deal has to sit
// before the page starts complaining about it. All three render perfectly
// plausibly when they are wrong.

// usd, not formatMoney: the canvas writes "$5,000" on the Won tile, and
// "$5,000.00" reads as a line on a statement rather than a figure.
import { usd } from "@/lib/clientBalance";

export interface StageLike {
  key: string;
  label: string;
  count: number;
  totalCents: number;
}

export interface StageTile {
  label: string;
  /** The large figure. */
  value: string;
  /** The line under it. */
  caption: string;
  /** Inverted — Won only. */
  dark: boolean;
}

/**
 * One tile on the strip.
 *
 * The big figure is the count everywhere except Won, where it is the
 * money. That is the canvas's own asymmetry and it is right: for a stage
 * in progress you want to know how many things are in it, and for Won you
 * want to know what you made. A count of 1 under "Won" tells you nothing
 * you would act on.
 */
export function stageTile(stage: StageLike): StageTile {
  const won = stage.key === "won";
  if (stage.count === 0) {
    // An em dash, not "$0". Nothing is in this stage, so there is no
    // amount to be zero — "$0" reads as a stage full of free work.
    return { label: stage.label, value: "0", caption: "—", dark: won };
  }
  const deals = `${stage.count} deal${stage.count === 1 ? "" : "s"}`;
  if (won) {
    return {
      label: stage.label,
      value: stage.totalCents > 0 ? usd(stage.totalCents) : String(stage.count),
      caption: deals,
      dark: true,
    };
  }
  return {
    label: stage.label,
    value: String(stage.count),
    // A stage can hold deals that nobody has priced yet. Saying "$0.00"
    // there is a claim about their value; saying so plainly is not.
    caption: stage.totalCents > 0 ? usd(stage.totalCents) : "No amount set",
    dark: false,
  };
}

/** "1 day in stage", "51 days in stage", or nothing when it is unknown. */
export function daysLabel(days: number | null | undefined): string | null {
  if (days == null || days < 0) return null;
  if (days === 0) return "Today";
  return `${days} day${days === 1 ? "" : "s"} in stage`;
}

/**
 * Past this, the page says so in red. A deal that has sat in one stage
 * for over a month has stalled, whatever the stage is — and the whole
 * point of a board is noticing that without being told.
 */
export const STALE_DAYS = 30;

export function isStale(days: number | null | undefined): boolean {
  return days != null && days >= STALE_DAYS;
}

/**
 * The guidance an empty column shows. "No deals" is true and useless; what
 * you want to know is what would put something here.
 */
const EMPTY_COPY: Record<string, string> = {
  lead: "Nothing new in. Deals land here when a prospect first replies.",
  intake: "Nothing in intake. Deals land here when a new client starts the intake chat.",
  proposalSent: "No proposals out. Deals land here when you send one.",
  signed: "Nothing waiting on a deposit. Signed deals sit here until the first payment arrives.",
  won: "Nothing won yet this pipeline.",
  lost: "Nothing lost. Long may it last.",
};

export function emptyCopy(key: string): string {
  return EMPTY_COPY[key] ?? "Nothing here yet.";
}
