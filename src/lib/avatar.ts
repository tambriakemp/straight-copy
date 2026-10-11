// The initials square beside a client's name.
//
// Pure because the interesting half is what it does with names that are
// not "Firstname Lastname": a business with a comma in it, a single word,
// a name that is only punctuation, nothing at all. A blank square beside a
// client in the roster is the kind of thing nobody files a bug for.

export interface AvatarStyle {
  initials: string;
  bg: string;
  fg: string;
}

// The canvas's four tints, plus ink. Picked by a hash of the name so the
// same client is the same colour on every page and between sessions —
// index-based colours shuffle the moment the list is sorted differently.
const PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: "#F3E8FF", fg: "#6B2FB8" },
  { bg: "#E7EEFF", fg: "#2447C0" },
  { bg: "#FFF1E3", fg: "#A8440A" },
  { bg: "#E5F6EC", fg: "#17703D" },
  { bg: "#FBE9E7", fg: "#A32A1C" },
];

const INK = { bg: "#0E1116", fg: "#FFFFFF" };

/**
 * The first two letters, title-cased — which is what the canvas draws:
 * "Me" for Menovia, "Si" for Sims Resource Group, "Ma" for Magna Tax
 * Relief. Not one initial per word: "SR" and "MT" are the kind of
 * acronym you have to decode, and these squares sit next to the full
 * name anyway, so they are there to be recognised, not read.
 *
 * A leading title is dropped first, because "Dr." is not who anyone is
 * and three clients called Dr. Somebody would all square up as "Dr".
 */
function initialsOf(name: string): string {
  const letters = name
    .split(/[\s,·/|&]+/)
    .filter((w) => !/^(dr|mr|mrs|ms|the|a|an)\.?$/i.test(w))
    .join("")
    .replace(/[^\p{L}\p{N}]/gu, "");
  if (!letters) return "?";
  return cap(letters.slice(0, 2));
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * @param internal Our own books rather than a client's — the canvas gives
 *   Cre8 Visions the ink square, so it reads as the odd one out in a list
 *   of clients, which is exactly what it is.
 */
export function avatarFor(name: string, internal = false): AvatarStyle {
  const initials = initialsOf(name);
  if (internal) return { initials, ...INK };
  return { initials, ...PALETTE[hash(name) % PALETTE.length] };
}
