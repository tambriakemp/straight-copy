# straight-copy — working notes

The Cre8 Visions agency CRM. Vite + React + TypeScript + Tailwind on the front,
Supabase (Postgres + ~60 Deno edge functions) behind it, hosted by Lovable.

## Verification — read this before gating anything on it

```
npx tsc --noEmit -p tsconfig.app.json   # must exit 0
npm run test                            # must exit 0
npm run build                           # must exit 0
npm run lint                            # exits 1 on a clean tree — NOT a gate
```

`npm run lint` reports roughly 360 pre-existing problems and exits non-zero even
with no changes at all. Treating it as a pass/fail gate blocks every task
forever. Run it before and after, and check your change did not add to the
count.

## The task board

Tasks live in `project_tasks`, hanging off `client_projects`, hanging off
`clients`. There is no separate board product — the CRM is the board.

**When asked to put a task "on the board", the default target is the client
"Tambria Kemp", project "Cre8 Visions Agency Project".** Resolve both by name
rather than hardcoding a UUID; the board is edited by hand and ids move. A task
about a specific client's work goes on that client's project instead.

`status = 'ready_for_claude'` is the queue the `cre8-agency-queue` routine
picks up. Claim a task with the `claim_task` RPC before working on it and
release it on the way out — moving it to `in_progress` is not a claim, and two
overlapping runs will otherwise both do the same work.

The queue no longer waits for the next cron tick. A trigger on `project_tasks`
fires the routine's API endpoint the moment a task lands in `ready_for_claude`
(`20260822220000_queue_fires_on_ready.sql`). Two things about it: it is a no-op
until the Vault secrets and a `queue_fire_routes` row exist, so it is safe to
apply early; and it **debounces**, because moving five tasks to ready should
start one run, not five racing sessions. `queue_fire_log` records every
decision — `fired`, `debounced`, `no_secret`, `error` — which is the only way
to tell a routine that never fired from one that fired and did nothing.

Keep the cron schedule as a backstop. If a fire is dropped — token revoked,
daily routine cap hit, network blip — nothing else will notice the task.

Reached over MCP as the **Cre8 Visions** connector, which is `agency-mcp`
(`supabase/functions/agency-mcp/index.ts`). It must be enabled for a chat before
that chat can touch the board.

## Two things about deploying that have cost real time

**Lovable only deploys edge functions its own agent edited.** A function changed
by a git merge is never deployed — it stays on the old code and calls to it fail
in ways that look like frontend bugs.

**Asking Lovable's agent to deploy is the only way to deploy them.** This
project runs on **Lovable Cloud**, so the Supabase project
(`zjxvcgcuukgqawczanud`) lives in Lovable's organisation, not ours. There is no
Supabase dashboard for it, no service-role key, and no personal access token
that can reach it — so `supabase functions deploy`, the CLI, and anything built
on the Management API cannot authenticate against it, whatever credentials you
generate. Tell-tale signs of Cloud rather than a self-managed project:
`LOVABLE_API_KEY` and `ai.gateway.lovable.dev` in the functions.

So: send a message to the project agent (`lovable.dev/projects/3041a012-...`,
or the Lovable MCP `send_message`) naming the functions and saying explicitly
**not to change any code** — it will otherwise treat a deploy request as a
licence to edit. It deploys `_shared/` alongside them, which matters because
`agent-chat` and `agent-run` import from there and a stale copy fails to boot.

`.github/workflows/deploy-edge-functions.yml` exists and is correct, but it
cannot authenticate on Cloud. It is dead weight unless this project is ever
moved onto a Supabase account we own. It does at least fail loudly now rather
than reporting success while deploying nothing, which is how the tool loop sat
merged and undeployed for a full day.

**How to tell whether a deploy actually landed** — never trust a green check
or the agent's own summary. Send one chat message to any agent, then:

```sql
select role, status, duration_ms, iterations, tool_calls, stopped_by
from agent_messages where created_at > now() - interval '10 minutes'
order by created_at desc;
```

`duration_ms`, `iterations` and `tool_calls` are written only by the tool-loop
path. Null on a fresh assistant row means the old code answered it. Note the
columns only move on a **new** turn — checking straight after a deploy shows
nothing, because nothing has run yet.

**This database takes migrations from two sources** — this repo and Lovable's
agent — so every migration must be idempotent (`IF NOT EXISTS`,
`DROP POLICY IF EXISTS`, `ON CONFLICT DO NOTHING`). Assume anything you write
may already have been applied by the other side.

New columns are not in `src/integrations/supabase/types.ts` until it is
regenerated, so add them by hand or the build fails.

## House style

The admin surface deliberately does not use shadcn cards. It uses inline styles
on `var(--crm-*)` tokens (defined from `src/index.css:200`) and BEM-ish classes
— `.roster__*`, `.ws__*`, `.agent-card__*`. Read a neighbouring file before
inventing a pattern.

Shared modules under `supabase/functions/_shared/` that the frontend test suite
imports must have **no `npm:` specifiers** — a Deno specifier does not resolve
under the app's tsconfig. Declare the shape you need locally instead; see
`_shared/agents/rules.ts` and `table-access.ts`.

## Agents

`supabase/functions/_shared/agents/` — five agents defined in `registry.ts`,
each with a mission, an allowlist (`allowlists.ts`) and a context gatherer
(`context.ts`). They run a real tool loop (`loop.ts`) with read tools over an
allowlisted slice of the database (`table-access.ts` — this is the security
boundary, since these run as service role and bypass RLS).

`canAutoExecute` in `types.ts` is the single gate on side effects: outward work
needs approval unless the agent is fully autonomous, and destructive work always
needs approval.

## Permission prompts

`.claude/settings.json` is the only permission config in this repo — there is no
`.mcp.json`, no `settings.local.json`, and no user-level `~/.claude/settings.json`
in the remote container.

**The board connector resolves under three different names**, and a rule written
for one does not match the others:

| Where | Name it resolves as |
|---|---|
| most chats | `Cre8_Visions` |
| the `cre8-agency-queue` routine | `Cre8-Visions` (hyphen) |
| uuid fallback | `da963110-b18a-42dc-bf9c-f7c4356ca236` |

So `mcp__Cre8_Visions__list_tasks` sat in `allow` for two days while the queue
routine kept prompting on `mcp__Cre8-Visions__list_tasks`. The allow list now
carries all three, server-level and per-tool, and — this is the part that must
not be forgotten — **`deny` is mirrored across all three too**. Adding a name
variant to `allow` without mirroring `deny` silently unlocks the destructive
board calls under that name. Same for Lovable, which resolves as `Lovable` or
`9d5eb1e3-cc71-4b41-8865-438fdc5bfb0f`.

The dialog title names the resolved connector — "Allow Claude to use list tasks
(Cre8-Visions)?" is the rule that is missing, spelled out.

Two things this file cannot do: it cannot grant a claude.ai connector its
consent (per-account, in connector settings), and it cannot override the
session's permission mode, which is chosen at session launch and is not
settable from the repo. Note also that a fresh cloud container starts with
`hasTrustDialogAccepted: false` for this project in `~/.claude.json`, which a
local checkout does not — worth checking if rules that match still do not apply.
