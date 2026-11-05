// CRE-828: who provisions a Web Development purchase.
//
// The Client Portal plugin now creates the client, the project and the 50-task
// Web Dev backlog on a SureCart payment. `app_settings
// .surecart_webdev_provisioning_enabled` says whether `/admin` keeps doing it
// too, so the cutover and the way back are each one UPDATE and no redeploy.
//
// The decision lives here, away from the `npm:` specifier in the webhook, so
// the fail-safe direction below is pinned by a test rather than by a comment.
// No npm: imports in this file -- the frontend test suite has to be able to
// import it.

export type ProvisioningSwitchRow = {
  surecart_webdev_provisioning_enabled?: boolean | null
} | null

/**
 * Is `/admin` still provisioning Web Development purchases?
 *
 * Everything that is not an explicit `false` reads as on: a failed read, a
 * missing singleton row, a column the migration has not added yet. That
 * direction is deliberate. Both systems creating a client shows up in two
 * places and can be merged; neither creating one is a paying client with
 * nothing, found by the client rather than by us.
 */
export function webDevProvisioningEnabledFrom(
  row: ProvisioningSwitchRow,
  error: unknown
): boolean {
  if (error) return true
  return row?.surecart_webdev_provisioning_enabled !== false
}
