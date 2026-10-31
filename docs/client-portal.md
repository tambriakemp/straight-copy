# The client portal (mockups 13-16)

The four screens a client sees: home, agreements, payments, saved logins.
Built for CRE-776 (CP-5). This is the map; the reasoning lives in the file
headers, which are the thing to read before changing any of it.

## The shape of it

```
browser                     this project's server              elsewhere
───────                     ─────────────────────              ─────────
src/pages/portal/Client*.tsx
  └─ src/lib/clientPortalApi.ts
       │ POST, with the caller's own Supabase session
       ▼
     supabase/functions/client-portal/index.ts
       │ resolvePortalCaller → one client id
       ├─ plugin-source.ts ──── Client Portal plugin v1 API ──▶ Paperclip
       └─ legacy-source.ts ──── the /admin tables
```

**The browser never holds a credential that can read more than its own
client.** The plugin authenticates a Paperclip board session or an agent API
key, and the key this project holds is scoped to the whole company — one copy
of it in a client's browser is a copy of every client's proposals, invoices
and saved logins. So it lives in the edge function's environment and appears
in no response, no error and no log line. There is no `VITE_` variable
anywhere in this feature, which is the mechanical version of the same
sentence: a `VITE_` name is compiled into the bundle.

## Two sources, one shape

`PortalSource` (`client-portal/source.ts`) has two implementations:

| | |
|---|---|
| `plugin-source.ts` | The Client Portal plugin's v1 API. **The destination.** |
| `legacy-source.ts` | The `/admin` tables. **A bridge, scheduled for deletion.** |

Which one answers is decided per request by whether the three
`CLIENT_PORTAL_*` variables are set — never a fallback and never a retry, so
an install cannot read half its data from one and half from the other. A
plugin that is configured and unreachable is an error the client sees, not a
silent slide back to stale rows.

The bridge exists because the plugin has never been installed anywhere and
the import that would move the data into it is CP-6, which is gated on the
owner's approval. Without it, merging these screens would take the portal of
every current client blank until that approval arrives.

**Retiring it** is three environment variables and deleting one file. No
screen changes, because no screen knows which source answered it.

### What the bridge cannot do

* **No credential requests.** `cp_credential_requests` is new in the plugin;
  these tables have no record of an agency asking a client for a login. So
  mockup 16's right-hand panel renders as a plain "share a login" form rather
  than an answer to a named ask.
* **No receipts.** The SureCart receipt lives at the provider and nothing
  here kept the address. The Receipt button on mockup 15 is absent on this
  source and present on the plugin, which has a column for it as of CP-5.

### The source PDF of an uploaded proposal

Both sources serve it, and they hold it in different places — worth knowing
before CP-6, because the import does not move it.

On the bridge it is a path in `source_pdf_path`. On the plugin it is in the
plugin's own schema, as of CRE-801: the bytes could not stay in the host object
store, which a plugin can only reach with `plugin.assets.read`, a capability
name that does not exist on a stock Paperclip and whose presence in a manifest
means refused at install. So the plugin keeps its own copy and serves it with
no capability at all.

`hasSourcePdf` is true on either source exactly when that source holds the
document, so the link is drawn on the proposals that have one and not on the
ones that do not. **The distinction that matters after the import:** the
snapshot export carries `source: 'pdf_upload'` and no bytes, so an imported
proposal is marked an upload with nothing to download until somebody attaches
the file from the board. Until then `/admin` remains the only holder of the
historical PDFs — a retention fact for the cutover, not a bug in either source.

## What the home screen shows

Bree's decision of 28 Oct: **the client's current projects, plus any task
waiting on them.** It replaced a question this screen shipped with — the hero
line, the target date and the "Latest from the team" feed are presentation
with nowhere to be typed in, so on the plugin source all three were simply
absent and the screen opened on a greeting and a progress bar.

Both halves of her answer are derived from records that already exist, which
is the point: nothing here needs an editor somebody has to remember to fill
in, and nothing can go stale against the project it describes.

| | |
|---|---|
| **Your projects** | `HomeView.projects`. Non-archived projects, newest movement first. |
| **Waiting on you** | `HomeView.waitingOnYou`. Unsigned proposals **and a payable invoice**. |

Three things about the project list worth knowing before changing it:

* **The name is the project's own**, never composed for the client. Paperclip
  projects are the source of truth, and a second client-facing name would be a
  second thing to keep true. On the plugin source the name is resolved through
  the host from `paperclipProjectId`; a project the plugin cannot name is left
  out of the list rather than listed as "Untitled".
* **`kind` and `statusLabel` are words, not keys.** `site_preview` on a
  client's screen is the mistake CRE-797 cost us once already. Both map through
  `projectKindLabel` / `projectStatusLabel` in `_shared/client-portal-shape.ts`,
  which hold the `/admin` and Paperclip vocabularies side by side so one
  spelling cannot mean two things either side of CP-6's import.
* **The link is drawn only when there is a page.**
  `/portal/:clientId/projects/:projectId` is the `/admin` project page and
  takes an `/admin` id, so the bridge links every row and the plugin links
  only what CP-6 imported (`legacyAdminProjectId`). A row with no button is
  still a project whose state the client can read. When that page moves —
  CRE-784 — `pluginProjects` is the line that changes.

**Paying an invoice is now a task and not only a number.** Signing a proposal
has always produced a row in Waiting on you; a bill the client could pay today
appeared only as the Next payment card. A list headed "Waiting on you · 1"
was telling a client the money was not one of the things waiting on them. The
amount travels in the row's title because the two cards stack on a phone.

## Configuration

| Variable | What happens without it |
|---|---|
| `CLIENT_PORTAL_API_URL` | The `/admin` tables answer instead |
| `CLIENT_PORTAL_API_KEY` | ditto — a Paperclip **agent API key** |
| `CLIENT_PORTAL_COMPANY_ID` | ditto |
| `PORTAL_AGENCY_NAME` | This install answers as `Cre8 Visions` |
| `PORTAL_MONOGRAM` | The tile beside the name is this agency's `C8`, or a licensee's initials |
| `PORTAL_CONTACT_NAME` | This install answers as `Bree`; a licensee's screens say "Message us" and "We asked for" |
| `PORTAL_REPLY_WINDOW` | Nothing is said about reply times |
| `PORTAL_CONTACT_EMAIL` | This install offers its own inbox; a licensee's offers nothing |
| `PORTAL_VIEW_AS_KEY` | **Open portal** returns "not set up on this install yet". See below |
| `PORTAL_VIEW_AS_PLUGIN_KEY` | The plugin's own **View as client** button does the same |

All five are resolved in **one place**,
`supabase/functions/_shared/client-portal-branding.ts`, which is the only
module in this feature that knows whose install it is. Nothing downstream of
it names an agency, a mark or an inbox —
`src/test/portal-branding.test.tsx` fails if anything starts to.

`PORTAL_CONTACT_NAME` answers **`Bree` for this install and nothing for a
licensee** (Bree's decision, 28 Oct). The name is in `THIS_INSTALL` rather
than left to the variable on the live project, because a decision that exists
only as an unset environment variable takes effect when somebody remembers to
set it during a deploy and silently does not when they do not — and the
symptom is screens that quietly read "Message us" forever. Setting the
variable still overrides it, so changing the name is one variable and no
deploy.

For a licensee the field stays empty, and there the original reasoning holds
harder: mockups 14 and 16 put a first name in running text, and a name of ours
on their portal is not a missing default but a wrong one — a client told to
message somebody at a company they have never heard of.

### Who the defaults belong to

The defaults in that table are **this agency's identity, not the product's**,
and they apply only to an install answering under this agency's name. Set
`PORTAL_AGENCY_NAME` to anything else and none of them do: the monogram
becomes the initials of that name and the contact address becomes nothing,
which hides the "Ask a question" button rather than offering one that mails
somebody else's agency. Unset and set-to-our-own-name are the same install,
deliberately — otherwise setting the variable explicitly would change what
this agency's own clients see.

`PORTAL_MONOGRAM` exists because a mark is not derivable from a name: this
agency's is `C8` and the initials of "Cre8 Visions" are `CV`. It takes up to
three characters, or the literal `none` for no tile at all. **A licensee who
sets nothing gets their own initials, and never ours** — CRE-797 was `C8`
written into the top bar beside a name read from `agencyName`, which put our
mark on a licensee's client's screen and was invisible in every screenshot
taken of our own portal.

Check what an install resolved to, without revealing anything:

```sh
curl -s -X POST "$SUPABASE_URL/functions/v1/client-portal" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"action":"health"}'
# → {"ok":true,"source":"admin-tables","plugin":{"baseUrl":false,...},
#    "wire":"1.3.0","monogram":true}
```

Booleans, a source name and a version. A diagnostic that printed the first
characters of a key is a diagnostic somebody pastes into a ticket — and
`monogram` is a boolean for the same reason in miniature: whether a tile will
be drawn is a deploy question, which two characters are in it is branding the
licensee owns.

## Admin view-as (CRE-811)

**Open portal** on a client's `/admin` page shows an admin exactly what that
client sees, with no login prompt. It used to be a link to
`/portal/<id>?as=admin`, which is not a credential but a request: whether it
worked depended on whether the new tab found an admin Supabase session in
storage, and when it did not the portal showed the **client login**. The login
is for clients.

```
/admin client page                     portal tab
──────────────────                     ──────────
click "Open portal"
  └─ POST functions/v1/portal-view-as  ← the admin's own session, from the
       │ resolveCaller → "admin"          tab that demonstrably has one
       │ INSERT portal_view_as_log ('minted')
       ▼ { token, url }
     window.open(url)  ─ /portal/<id>#view-as=<token> ─▶
                                       adoptViewAsFromUrl()
                                         strips the fragment
                                         sessionStorage
                                       every request: x-portal-view-as
                                         └─ resolvePortalCaller verifies,
                                            checks VIEW_AS_READS,
                                            logs 'redeemed' once
```

**What the token is.** HMAC-SHA256 over a JSON payload, `cv1.<payload>.<sig>`,
all base64url so it is fragment-safe unescaped. It names one client, one
actor, and an expiry **30 minutes** out, and it is not renewable — clicking
the button again mints a new one and leaves a second audit row.

**Why the fragment.** A fragment is never sent to a server, so the token is
not in an access log, not in a `Referer` on every asset the portal then loads,
and not in anything an edge proxy records. It is stripped from the address bar
on arrival, so it is not in history either, and it is held in `sessionStorage`
so it dies with the tab rather than waiting in a browser tomorrow.

**It is read-only, and that is an allowlist.** `VIEW_AS_READS` in
`_shared/portal-view-as.ts` names the function-and-action pairs a view-as
token may reach, and **fails closed**: anything not named gets a 401. Today
that is the six dark-nav screens, the contract download, and the one
`proposal-sign` action the bridge delegates that download to — `client-portal`
(`home`, `agreements`, `payments`, `logins`, `document`), `proposal-sign`
(`download`), and, since CRE-818, `brand-kit-intake` (`resolve`) and
`client-files` (`list`). Signing, declining, paying, sharing a login,
uploading a file and advancing a journey node are not on it, which is Bree's
condition on the card — she must not be able to sign or pay as the client by
accident. The inverse (a denylist of writes) would have had the opposite
default, and the default is the whole question.

**An entry is not enough on its own: the function must pass its action.**
`resolvePortalCaller(req, clientId)` with two arguments refuses every view-as
token, because the allowlist cannot answer "may this token do this" without
being told what "this" is. `brand-kit-intake` and `client-files` were both
reachable screens that still 401'd for exactly that reason until CRE-818.
`src/test/portal-view-as.test.ts` pins the three-argument call on all three
browser-facing functions, and pins `x-portal-view-as` in each one's CORS
`Access-Control-Allow-Headers` — a header a function does not advertise is a
header the browser drops at preflight, so the request never arrives to be
logged.

**Two blocks on the Project screen cannot be previewed at all**, whatever the
allowlist says. The phase ladder, the signed-contract check and the
discovery-chat history are read through `supabasePortal` (PostgREST), and a
view-as session has no Supabase session for RLS to recognise; the page-review
count is `preview-approvals`, which is deliberately not on the list. Each
would fail silently and read as a real answer — no phases, contract unsigned,
nothing to review — so `ClientProject.tsx` skips those reads in a view-as
session and names the four missing blocks in a panel instead. Files is
complete: `list` is allowed, and the drop zone and the remove buttons are
replaced by a line saying a preview is read-only.

**The older light frame still does not open in a view-as session**, and that
is the honest limitation rather than an oversight: Proposals, Brand Kit and
Feedback read through functions with no allowlist entry, so they 401.
`?as=admin` still works there for an admin with a session in the tab. Adding
one of them is one line in `VIEW_AS_READS`, the action passed through to
`resolvePortalCaller`, and that function's own redeploy; doing it blind, for a
page whose write actions nobody has read, is how a preview learns to sign
things.

**Every look is logged.** `portal_view_as_log` takes a `minted` row when an
admin asks and one `redeemed` row the first time the token is used — the
unique index on `(jti, event)` is what makes the second one row rather than
one per request. `portal-view-as` **refuses to mint if it cannot write that
row**, including when the migration has not been run: a grant nobody can audit
is not a grant this codebase issues.

**The two keys.** `PORTAL_VIEW_AS_KEY` signs this project's own grants;
`PORTAL_VIEW_AS_PLUGIN_KEY` verifies the ones the Client Portal plugin's
client page mints inside Paperclip. Separate so the plugin's can be rotated —
or revoked, by unsetting it — without logging every admin out of their own
preview. **An unset key refuses its issuer.** There is no development
fallback and no default; a signature scheme with a guessable key fails worse
than a button that says it is not configured.

## Routes

| Path | Screen |
|---|---|
| `/portal/:clientId` | Home (13) |
| `/portal/:clientId/agreements` | Read and sign (14) |
| `/portal/:clientId/payments` | Payments (15) |
| `/portal/:clientId/logins` | Saved logins (16) |
| `/portal/:clientId/project` | Project. One live project opens; several show a chooser |
| `/portal/:clientId/project/:projectId` | That project, on the redesigned screen |
| `/portal/:clientId/files` | Files. Same chooser when there are several projects |
| `/portal/:clientId/files/:projectId` | That project's files |
| `/portal/:clientId/projects` | The chooser, same screen as Project |
| `/portal/:clientId/feedback` | The existing feedback board |

Real routes rather than the old `?v=` view switcher, so a client can send
"here is the payment page" to their bookkeeper and the back button works.

Home's Open link is `/portal/:clientId/project/:projectId`. The older
`/projects/:projectId` page is still there for bookmarks. Feedback is the
existing board, linked from the nav, and that screen is unchanged.

## Two things the screens will not do

* **List a password.** The logins view carries a mask. Copy asks
  `reveal-login` for that one row, and only for a login shared with the
  signed-in client (or an admin previewing that client). The value is
  written to the clipboard and is not kept in React state. The admin-tables
  source decrypts through `reveal_client_login`, which checks `client_id` in
  the same statement, and writes an `activity_events` row (`kind =
  portal_login_revealed`) before returning it. The plugin source has no
  decrypt and refuses. The eye toggle on the share form reveals what the
  client is typing, before it is sent, which is a different thing.
* **Mark anything paid.** `checkout` returns a URL and nothing else. Money is
  only ever banked by a verified provider webhook, which goes to the plugin.
  A portal that could mark its own invoices paid would be a portal in which a
  client could.

An admin previewing a client's portal (`?as=admin`) is refused every write,
including signing. The preview exists so the agency can see what the client
sees, and a signature attributed to a client and made by the agency would be
a false statement in an audit trail.

## The wire contract, and its mirror

`supabase/functions/_shared/client-portal-wire.ts` is canonical and
`src/lib/clientPortalWire.ts` is a byte-identical copy below its header.
`src/test/client-portal-wire.test.ts` fails if they drift and prints the
first differing line. The copy exists because `tsconfig.app.json` includes
only `src`, so the Deno half is never typechecked by the build the frontend
ships through.

The pure shaping is in `_shared/client-portal-shape.ts` rather than beside
the source that uses it: a module that reaches `Deno` cannot be imported by
the frontend test suite at all. Same for the branding resolution in
`_shared/client-portal-branding.ts`, and it matters more there: the branch
that matters most is the one only a licensee's install takes, which no
screenshot of our own portal would ever show.

### Its revision

`PORTAL_WIRE_VERSION` is in the contract and reported by `health`. It exists
because the two halves are deployed separately **and in an order** (see
Deploying, below): the gap between deploying the function and publishing the
frontend is exactly the window in which one half speaks a shape the other
does not, so "has the field landed on the server yet" should be a request
somebody can make rather than a thing they assume.

The promise is the one the plugin's own `v1` API makes: a revision never
removes a field, never renames one, and never changes what an enum member
means. It may **add an optional field**, so every reader treats an absent
optional field as a server older than its own copy and draws what it would
draw for an unset value — never as an error, and never by substituting a
guess of its own.

| | |
|---|---|
| `1.9.0` | `LoginsView.canCopyPassword` (CRE-824): whether this install can decrypt a saved login back to the client that shared it. The admin-tables bridge always can; the plugin never can, by design -- write-only is what lets a vault sit behind a portal session at all. Optional; absent draws as `true`, what every server before this one actually did. |
| `1.8.0` | `PortalSubscription`, `SubscriptionActionResult` and `PortalOnboardingInvite` (CRE-822, G5/G6): the recurring-plan card and the "complete your Brand Voice chat" banner, both of which used to be read off `brand-kit-intake`'s `resolve` action. Wholly new shapes -- no optional default, because a server older than this copy has no such actions at all. |
| `1.7.0` | `PaymentRow.projectId` and `.projectName` (CRE-831): which project a payment is for, so the Payments tab says it on the row, groups the table by project and offers a project filter. Optional; absent or null is a payment filed under no project, drawn in one "Other payments" group with no project named. One group draws no heading and no filter. |
| `1.6.0` | `HomeView.sharedDriveLinks` (CRE-827): the client's own shared-drive links, one or more, each tagged to a project, replacing the Files tab's upload button. Optional; absent or empty draws the Files tab's "no link yet" prompt. |
| `1.5.0` | `AccountAccessView` and `AccountAccessItem` (CRE-822, G4): "Set Up Your Accounts", moved off the `/admin` jsonb column it used to read and write in clear. No optional default -- the whole shape is new. |
| `1.4.0` | `SharedLogin.projectId` and `.projectName`. Optional; absent or null draws no project label. |
| `1.3.0` | `HomeView.buildStartDate`/`.deliveryDate`/`.deliveryVideoUrl`, `SharedLogin.note`/`.sortOrder`, `AgreementView.versionGroupId`/`.paymentDueDays`/`.paymentTerms`/`.firstViewedAt`/`.declinedAt`/`.declineReason` (CRE-822). All optional; absent draws null. |
| `1.2.0` | `HomeView.projects` (CRE-776). Optional; absent draws no card. |
| `1.1.0` | `PortalBranding.monogram` (CRE-797). Optional; null draws no tile. |
| `1.0.0` | The four screens, mockups 13-16 (CRE-776). |

Bump it in the canonical copy, copy it across to the mirror, and add the row.
`src/test/portal-branding.test.tsx` fails if this page stops naming the
current revision.

## Verifying

```sh
npx tsc --noEmit -p tsconfig.app.json          # clean
npm run test                                   # 1180 tests
npm run build
deno check --node-modules-dir=auto supabase/functions/client-portal/index.ts
```

If `npm run test` or `npm run build` dies with "Failed to load native
binding", the `@vitejs/plugin-react-swc` addon cannot be materialised in that
sandbox. `vitest.node.config.mts` runs the same suite with esbuild doing the
JSX; the gate is still `npm run test`.

## Reviewing the screens: the QA harness

All four client screens sit behind `RequirePortalAuth` and a real Supabase
session, so reviewing them used to need a live portal account for a live
client. QA has none, and the consequence was CRE-789: an audit that could
check the auth gate at four widths and not one pixel of the screens behind
it. Every statement about their content came from comparing mockups to the
developer's own screenshots, which is the author marking his own work.

```sh
VITE_PORTAL_DEMO=1 npm run dev     # then open /portal/demo
```

That serves all four screens from fixtures, with no session and no network:
`/portal/demo`, `/portal/demo/agreements`, `/portal/demo/payments`,
`/portal/demo/logins`. Signing, declining, sharing and removing a login all
work and stick until you reload. Credentials were the alternative and are
the worse answer — they expire, leak, need rotating, and are ours, so a
licensee's QA hits the same wall on their first day. A harness ships with
the product.

**The fixtures carry the awkward rows on purpose**, because a list is broken
by its awkward row: every payment state, every waiting icon, a proposal
built here and one that arrived as an uploaded PDF, a paid row with a
receipt and one without, a request from an agent and one from a person, and
labels long enough to overflow a 375px column.

**Three things keep it out of production**, and none is trusted alone:

1. **A build flag.** `VITE_PORTAL_DEMO` is read through `import.meta.env` at
   every use site, so with it unset each guard folds to `false` at build
   time and the fixtures are never emitted. Verified against the real build
   output, not assumed:
   ```sh
   npm run build && grep -rl "Northhill\|demo_unimplemented" dist/   # no matches
   ```
2. **A reserved client id.** Even in a demo build the harness answers for
   `demo` alone — not a UUID, so it cannot collide with a real client. Any
   other id takes the real path: real session, real function, real refusal.
3. **No network.** The harness never calls `portalFetch`, so it has no route
   to a real client's data in any configuration.

The flag belongs on the command line and **not in `.env`** — `.env` is
committed here and feeds the production build, so a line in it would ship
the harness to clients. `src/test/portal-demo.test.ts` fails if one appears,
and also pins the three properties above and the opt-in route list.

Before the harness existed the screens were compared against the mockups by
rendering the real components against stubbed data at 1440px.

## Deploying

Two steps, and **they are ordered: deploy the function first, then publish.**

1. **Deploy the function.** `supabase/functions/client-portal/` is a **new**
   function, and Lovable only deploys functions its own agent edited. Ask the
   project agent to deploy `client-portal` and `_shared/`, and tell it
   explicitly not to change any code.
2. **Publish.** Merging to `main` does not publish; publishing is the owner
   pressing Publish in Lovable.

### Why the order is not a preference

`/portal/:clientId` is the route every client already lands on, and it now
renders `ClientHome` instead of the old project list — the three new screens
hang off it. All four reach their data through the one call in
`src/lib/clientPortalApi.ts`, and that call names one function. So publishing
before the deploy does not degrade one screen for the clients who go looking
for it: **every current client's portal fails at the front door**, and all
four screens behind it fail too, for exactly as long as the gap between the
two steps lasts.

It fails tidily — each screen renders `PortalProblem`, an explanation and a
Retry button, rather than a blank page or a stack trace — and that is the
behaviour we want when the server is unreachable for any reason. It is still
an outage every client can see. Deploy first and the gap never exists.

The `legacy-source.ts` bridge does not rescue this. The bridge lives *inside*
the function, so an undeployed function means no data regardless of which
source would have answered.

### CRE-811 adds a migration and a secret, and they come first

View-as is the one part of this feature with a step against this database, and
the order is `SQL → secrets → functions → publish`:

1. **Run `supabase/migrations/20261028190000_portal_view_as_log.sql`.**
   `portal-view-as` refuses to mint without the table, on purpose, so doing
   this second means a window where the button returns "not set up yet".
2. **Set `PORTAL_VIEW_AS_KEY`** in the project's edge-function secrets, to a
   long random value. This project runs on **Lovable Cloud**: there is no
   Supabase dashboard access and no project keys on this side, so the secret
   is added by asking Lovable to store it — its agent can generate the value
   itself, or render its own secure secret form, and neither route puts the
   value in the chat transcript. Generate it where it will live; it belongs in
   no commit, comment or log. `PORTAL_VIEW_AS_PLUGIN_KEY` is only needed once
   the Agent Platform plugin's own button is in use.
3. **Deploy `portal-view-as` (new), `client-portal` and `proposal-sign`**, plus
   `_shared/`. Those three are the only ones whose behaviour changes.
   `_shared/webhook-auth.ts` is imported by eleven functions, but an
   undeployed one simply goes on refusing view-as tokens — it fails closed, so
   there is no ordering hazard in leaving them.
4. **Publish**, which is the owner pressing Publish in Lovable.

**CRE-818 adds two more functions to step 3 and nothing to steps 1 and 2.**
`brand-kit-intake` and `client-files` are what the Project and Files screens
call, and they change in the same two ways: the action is passed to
`resolvePortalCaller`, and `x-portal-view-as` is added to their CORS
`Access-Control-Allow-Headers`. Both need deploying with `_shared/`, and both
fail closed until they are — an undeployed one goes on 401ing view-as
requests, which is the behaviour the card is fixing, not a new one. No
migration and no secret.

Otherwise nothing here needs a migration against this database. The
plugin-side migrations belong to the Agent Platform repository and run against
a Paperclip install, not this one.
