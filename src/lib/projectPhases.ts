// The phase strip on the project page.
//
// A placeholder, and labelled as one on the card. There is no phase schema
// — nothing records that a project has moved from Design to Build — so
// these five read off the task percentage instead of off a plan. Bree
// asked for it stubbed until the schema exists.
//
// Pure and tested because the boundaries are arbitrary and so are easy to
// get wrong in a way nobody notices: a project at 0% must not already be
// in Build, and a project at 99% must not be in Release.

export const PROJECT_PHASES = ["Scope", "Design", "Build", "Test", "Release"] as const;

// The lower bound of each phase, as a percentage of tasks complete. Build
// is wide because it is where almost all of the work is; Release only at
// 100, because a release has either happened or it has not.
const BOUNDS = [0, 10, 25, 85, 100];

/**
 * Which phase a project at `pct` complete is "in" — the index into
 * PROJECT_PHASES that the strip marks Now.
 */
export function phaseStateAt(pct: number): number {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  let index = 0;
  for (let i = 0; i < BOUNDS.length; i++) if (p >= BOUNDS[i]) index = i;
  return index;
}
