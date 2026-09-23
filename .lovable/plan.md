# Client-first admin information architecture

## Build
- Replace `/admin` with a client operations home: a four-part status strip for unsigned proposals, balances due, previews awaiting approval, and upcoming payment dates, followed by the shared client roster.
- Extend the shared client roster with optional operational badges, preserving its current use in the standalone and agent workspace views.
- Add `/admin/proposals` and `/admin/payments` rollup pages that list every client's records and link each item back to its existing project page for full actions.
- Add `/admin/social` as an all-project social workspace, using the existing social workflow after choosing a project.
- Replace the desktop Agents/Clients chips with Clients, Proposals, Payments, and Social/Marketing. Turn the workspace menu into the Profile menu containing Agents, Tasks / Queue, Wiki, Tokens, Invites, Ventures, Portfolio, Profile, and Sign out.
- Replace the mobile tabs with Home, Payments, Proposals, Social, and Profile, and update mobile page titles.
- Keep `/admin/clients` as a compatibility route to the existing roster and leave client, project, preview, and agent workspace screens unchanged.

## Data rules
- Pending proposals are proposals in `sent` status without a client signature.
- Outstanding balances are non-void, non-paid invoices that have been sent; upcoming due dates include scheduled or sent unpaid invoices with a future due date.
- A preview is awaiting approval when its preview project has no recorded approval. Status rows and rollups link to their owning client project.
- No prospect or outreach data is queried or displayed.

## Technical details
- Use existing authenticated table reads and current admin visual tokens; no database or edge-function changes.
- Add focused navigation tests and run the application typecheck and full test suite.
