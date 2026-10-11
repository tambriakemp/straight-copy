// What colour a pipeline stage is, on Today's Pipeline card.
//
// The stage on a hot lead is a free string written by the brief — "Won",
// "Offer sent", "Proposal sent", "Intake call booked" — not one of
// pipeline-board's stage keys, because the agent writes what happened in
// its own words. So this matches on meaning rather than on an enum, and
// falls back to neutral rather than guessing.
//
// Pure and on its own because the fallback is the interesting case: an
// unrecognised stage must come back grey, never as "Won".

export type ChipTone = "green" | "red" | "amber" | "blue" | "gray";

/** The dot beside a lead's name, keyed to the same tone as its chip. */
export const TONE_DOT: Record<ChipTone, string> = {
  green: "var(--cv-tone-green-fg)",
  red: "var(--cv-tone-red-fg)",
  amber: "var(--cv-tone-amber-fg)",
  blue: "var(--cv-accent)",
  gray: "var(--cv-faint)",
};

export function stageTone(stage: string | null | undefined): ChipTone {
  const s = (stage ?? "").toLowerCase();
  if (!s) return "gray";
  // Checked before "won", so "lost" does not match on a stray substring,
  // and before "signed"/"sent" so "lost after proposal" stays red.
  if (/\blost\b|\bdeclined\b|\bno\b$/.test(s)) return "red";
  if (/\bwon\b|\bsigned\b|\bclosed\b|\bpaid\b/.test(s)) return "green";
  if (/proposal|offer|quote|estimate|\bsent\b/.test(s)) return "amber";
  if (/intake|call|meeting|discovery|booked/.test(s)) return "blue";
  return "gray";
}
