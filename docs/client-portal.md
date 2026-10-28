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

### What the plugin cannot do, yet

* **Serve the source PDF of an uploaded proposal.** It is in the host object
  store, which a plugin can only reach with `plugin.assets.read` — a
  capability name that does not exist on a stock Paperclip, so a manifest
  declaring it is refused at install. `hasSourcePdf` is reported `false` on
  that source so no dead link is drawn. Worth a card if uploaded proposals
  matter to a licensee.

## Configuration

| Variable | What happens without it |
|---|---|
| `CLIENT_PORTAL_API_URL` | The `/admin` tables answer instead |
| `CLIENT_PORTAL_API_KEY` | ditto — a Paperclip **agent API key** |
| `CLIENT_PORTAL_COMPANY_ID` | ditto |
| `PORTAL_AGENCY_NAME` | This install answers as `Cre8 Visions` |
| `PORTAL_MONOGRAM` | The tile beside the name is this agency's `C8`, or a licensee's initials |
| `PORTAL_CONTACT_NAME` | The screens say "Message us" and "We asked for" |
| `PORTAL_REPLY_WINDOW` | Nothing is said about reply times |
| `PORTAL_CONTACT_EMAIL` | This install offers its own inbox; a licensee's offers nothing |

All five are resolved in **one place**,
`supabase/functions/_shared/client-portal-branding.ts`, which is the only
module in this feature that knows whose install it is. Nothing downstream of
it names an agency, a mark or an inbox —
`src/test/portal-branding.test.tsx` fails if anything starts to.

`PORTAL_CONTACT_NAME` has **no fallback on purpose.** Mockups 14 and 16 put a
person's first name in running text, and a name compiled into a component
keeps rendering perfectly after that person leaves. Unset is true whoever is
reading the mail that week.

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
#    "wire":"1.1.0","monogram":true}
```

Booleans, a source name and a version. A diagnostic that printed the first
characters of a key is a diagnostic somebody pastes into a ticket — and
`monogram` is a boolean for the same reason in miniature: whether a tile will
be drawn is a deploy question, which two characters are in it is branding the
licensee owns.

## Routes

| Path | Screen |
|---|---|
| `/portal/:clientId` | Home (13) |
| `/portal/:clientId/agreements` | Read and sign (14) |
| `/portal/:clientId/payments` | Payments (15) |
| `/portal/:clientId/logins` | Saved logins (16) |
| `/portal/:clientId/project` | Resolves a project, hands over to the existing page |
| `/portal/:clientId/files` | Same, landing on its Files tab |
| `/portal/:clientId/projects` | The old portal page, kept as the project list |

Real routes rather than the old `?v=` view switcher, so a client can send
"here is the payment page" to their bookkeeper and the back button works.

**Project and Files have no new screens.** Both already exist on the project
page, the brief was mockups 13-16, and the brief says to ask before adding or
renaming UI. The consequence is visible: those two lead to pages in the older
light frame. Flagged on the card rather than fixed by redesigning two screens
nobody drew.

## Two things the screens will not do

* **Read a password back.** A client may share a login and may not read one
  back. The plugin refuses it at the API, the legacy source never
  implemented it, and `PortalSource` has no method to call — three
  independent reasons, because the failure this prevents is one forwarded
  portal link turning into a credential dump. The eye toggle on the share
  form reveals what the client is typing, before it is sent, which is a
  different thing.
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

Nothing here needs a migration against this database. The plugin-side
migrations belong to the Agent Platform repository and run against a
Paperclip install, not this one.
