// The QA harness gate for the four client screens (mockups 13-16).
//
// WHY THIS EXISTS. Every client screen sits behind `RequirePortalAuth` and a
// real Supabase session, so reviewing them needs a live portal account for a
// live client. QA has no such account, and the honest consequence showed up
// on CRE-789: the audit could check the auth gate at four widths and could
// not check a single pixel of the screens behind it. Every statement about
// their content rested on comparing mockups to the developer's own
// screenshots, which is not review -- it is the author marking his own work.
//
// The alternative was test portal credentials. Credentials expire, leak, need
// rotating, and are ours: a licensee's QA hits the same wall on their first
// day and a Cre8-only login does nothing for them. A harness ships with the
// product. That is why this is the answer and not a shared password.
//
// THREE THINGS KEEP IT OUT OF PRODUCTION, and no one of them is trusted alone.
//
//  1. BUILD FLAG. `VITE_PORTAL_DEMO` is read through `import.meta.env` at
//     every use site, never through a re-exported boolean. Vite substitutes
//     the literal at build time, so with the flag unset each guard folds to
//     `false` and Rollup drops the branch -- and with it the dynamic import
//     of the fixtures, which is why the fixtures are a separate module. A
//     production bundle does not contain this data; `portal-demo.test.ts`
//     asserts that against the real build output rather than assuming it.
//
//  2. A RESERVED CLIENT ID. Even in a demo build, the harness answers for
//     exactly one id -- `demo`, which is not a UUID and therefore cannot
//     collide with a real client. Any other id takes the real path: real
//     session, real edge function, real refusal. So a demo build pointed at
//     a real client is not a bypass, it is an ordinary unauthenticated
//     browser.
//
//  3. NO NETWORK. The harness never calls `portalFetch`, so it never reaches
//     the `client-portal` function and never presents a token. There is no
//     configuration of it that returns a real client's data, because it has
//     no route to any.
//
// The flag belongs on the command line and NOT in `.env` -- `.env` is
// committed here and feeds the production build, so a line added to it would
// ship the harness to clients. That is a test, not a convention: see
// `portal-demo.test.ts`.
//
//     VITE_PORTAL_DEMO=1 npm run dev      # then open /portal/demo

/**
 * The one client id the harness answers for.
 *
 * Deliberately not a UUID. Real client ids are UUIDs everywhere in this
 * codebase, so this value cannot be mistaken for one by accident or
 * manufactured into one by a caller.
 */
export const DEMO_CLIENT_ID = "demo";

/**
 * Whether this request should be served from fixtures.
 *
 * Callers guard with `import.meta.env.VITE_PORTAL_DEMO === "1"` themselves
 * before calling this, so the dead branch is provable at each site. The
 * repeated check is not redundancy for its own sake: a single exported
 * boolean would make elimination depend on cross-module constant folding,
 * which is a property of the bundler's mood rather than of this code.
 */
export function isDemoClient(clientId: string | undefined | null): boolean {
  return import.meta.env.VITE_PORTAL_DEMO === "1" && clientId === DEMO_CLIENT_ID;
}
