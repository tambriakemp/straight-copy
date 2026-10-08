// CRE-366: task-id auto-linking shared by every brief section (and the
// CRE-358 calendar card). One place owns the regex and the known-prefix
// list so a new Paperclip project (e.g. "MEN") lights up everywhere at
// once instead of needing a per-component edit. Pure/no React here on
// purpose — see CLAUDE.md's "move the pure part into a dependency-free
// module" house style — so this is unit-testable without rendering.

export const KNOWN_ISSUE_PREFIXES = ["CRE"];

const PAPERCLIP_BASE = "https://paperclip.cre8visions.com";

export function isKnownIssuePrefix(prefix: string): boolean {
  return KNOWN_ISSUE_PREFIXES.includes(prefix);
}

export function issueUrl(prefix: string, num: string | number): string {
  return `${PAPERCLIP_BASE}/${prefix}/issues/${prefix}-${num}`;
}

export interface IssueTextSegment {
  text: string;
  prefix?: string;
  num?: string;
}

// Matches a known-prefix issue id, optionally followed by an en/em-dash
// range ("CRE-269–285"). Never matches a plain ASCII hyphen there — that's
// indistinguishable from ordinary punctuation ("pre-2020") and would
// false-positive constantly. Space-separated lists ("CRE-325 326 327") are
// expected to arrive as `task_ids` arrays — see `classifyRefChips` below —
// not parsed out of free-text prose.
const ISSUE_RE = /\b([A-Z]{2,5})-(\d+)(?:[–—](\d+))?\b/g;

/**
 * Splits free text into plain-text and issue-id segments. A segment has
 * `prefix`/`num` set when it's a linkable id; plain segments carry only
 * `text`. Unknown prefixes are left as plain text.
 */
export function linkifySegments(text: string): IssueTextSegment[] {
  if (!text) return [];
  const segments: IssueTextSegment[] = [];
  let last = 0;
  ISSUE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ISSUE_RE.exec(text))) {
    const [whole, prefix, num, rangeEnd] = m;
    if (!isKnownIssuePrefix(prefix)) continue;
    if (m.index > last) segments.push({ text: text.slice(last, m.index) });
    segments.push({ text: `${prefix}-${num}`, prefix, num });
    if (rangeEnd) {
      segments.push({ text: whole.includes("–") ? "–" : "—" });
      segments.push({ text: rangeEnd, prefix, num: rangeEnd });
    }
    last = m.index + whole.length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}

export function containsKnownIssueId(text: string): boolean {
  return linkifySegments(text).some((s) => s.prefix);
}

export interface RefChip {
  raw: string;
  prefix: string | null;
  num: string | null;
}

/**
 * Classifies a `task_ids`-style array into ref chips. A bare numeric entry
 * ("326") inherits the nearest preceding known-prefix entry's project, so
 * compact arrays like ["CRE-325", "326", "327"] all resolve to real links.
 * Anything else (e.g. a "+4" overflow marker, or an unknown-prefix id)
 * comes back unlinkable, and an unknown-prefix entry does not pass its
 * (unrecognized) prefix on to the numbers that follow it.
 */
export function classifyRefChips(ids: string[]): RefChip[] {
  let currentPrefix: string | null = null;
  return ids.map((raw) => {
    const idMatch = raw.match(/^([A-Z]{2,5})-(\d+)$/);
    if (idMatch) {
      currentPrefix = isKnownIssuePrefix(idMatch[1]) ? idMatch[1] : null;
      return currentPrefix ? { raw, prefix: currentPrefix, num: idMatch[2] } : { raw, prefix: null, num: null };
    }
    if (/^\d+$/.test(raw) && currentPrefix) {
      return { raw, prefix: currentPrefix, num: raw };
    }
    return { raw, prefix: null, num: null };
  });
}
