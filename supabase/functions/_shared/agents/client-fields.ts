// The values `clients` and `client_projects` actually accept.
//
// Pure and dependency-free for the same reason task-fields.ts is: actions.ts
// reaches npm: specifiers the frontend test runner cannot resolve, so a
// constant declared there is a constant no test can see. These are checked
// before the insert rather than coerced, because unlike a task priority there
// is no obvious right answer for a tier nobody sells — sending it back with
// the list beats quietly filing a client under the wrong plan.

/** clients.tier — CHECK (tier IN ('launch','growth','social')). */
export const CLIENT_TIERS = ["launch", "growth", "social"];

/**
 * client_projects.status — CHECK (status IN ('active','paused','complete','archived')).
 *
 * Not defaulted here. The column's own default is 'active' and it should stay
 * the single place that says so.
 */
export const PROJECT_STATUSES = ["active", "paused", "complete", "archived"];
