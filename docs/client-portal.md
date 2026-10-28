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
| `PORTAL_AGENCY_NAME` | Defaults to `Cre8 Visions` |
| `PORTAL_CONTACT_NAME` | The screens say "Message us" and "We asked for" |
| `PORTAL_REPLY_WINDOW` | Nothing is said about reply times |
| `PORTAL_CONTACT_EMAIL` | Defaults to the agency inbox |

`PORTAL_CONTACT_NAME` has **no fallback on purpose.** Mockups 14 and 16 put a
person's first name in running text, and a name compiled into a component
keeps rendering perfectly after that person leaves. Unset is true whoever is
reading the mail that week.

Check what an install resolved to, without revealing anything:

```sh
curl -s -X POST "$SUPABASE_URL/functions/v1/client-portal" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"action":"health"}'
# → {"ok":true,"source":"admin-tables","plugin":{"baseUrl":false,...}}
```

Booleans and a source name. A diagnostic that printed the first characters of
a key is a diagnostic somebody pastes into a ticket.

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
the frontend test suite at all.

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

The screens were compared against the mockups by rendering the real
components against stubbed data at 1440px. The harness is not in this repo —
see the CRE-776 card.

## Deploying

`supabase/functions/client-portal/` is a **new** function, and Lovable only
deploys functions its own agent edited. Ask the project agent to deploy
`client-portal` and `_shared/`, and tell it explicitly not to change any
code. Until that happens the function does not exist and the screens say they
could not reach the server.

Nothing here needs a migration against this database. The plugin-side
migrations belong to the Agent Platform repository and run against a
Paperclip install, not this one.
