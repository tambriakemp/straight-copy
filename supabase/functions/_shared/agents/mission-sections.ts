// Cutting one section out of a mission.
//
// Import-free so the frontend test suite covers it, and it earns that: this is
// "delete from here to somewhere", which is the same shape as the edit that
// silently truncated a migration file earlier in this project — replacing from
// a marker to the end when only one block was meant to go.
//
// A mission that loses a section it should have kept is worse than one that
// keeps a section it should have lost: the second reads oddly, the first
// quietly drops a rule the agent is supposed to be bound by.

/**
 * Remove one `## ` section, keeping everything before and after it.
 *
 * Cuts at the heading and resumes at the next `## ` at line start, so a
 * section in the middle goes without taking the rest of the document with it.
 * A heading that is not present leaves the mission untouched.
 */
export function withoutSection(mission: string, heading: string): string {
  const start = mission.indexOf(heading);
  if (start === -1) return mission;

  const next = mission.indexOf("\n## ", start + heading.length);
  const rest = next === -1 ? "" : mission.slice(next + 1);

  return (mission.slice(0, start) + rest)
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}
