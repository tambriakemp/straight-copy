# Decide-card contract (CRE-393)

How an agent (or Ara, relaying for one) adds a card to the Today page's
**Decide** section — the list of things an agent is stopped on until Bree
answers, as opposed to **Do**, which is her own work. See
`src/lib/needsYouRows.ts`'s `splitTodayRows`: a row lands in Decide purely
because it came from a brief's `approvals` array, nothing else.

## Where it lives

Append an object to the `approvals` array (jsonb) on the row the brief
ingest routine writes to `public.briefs`. No migration needed to add a new
card — the column is already a free-form array; only genuinely new fields
need a code change (and even those are additive/optional, see below).

## Fields

```ts
interface ApprovalCard {
  id: string;                 // stable across brief regenerations if you want
                               // Today to recognize "already answered" —
                               // reuse the same id on every brief that still
                               // carries this decision.
  title: string;
  context?: string;           // shown as the card body
  project: string;            // rendered as the ProjectTag pill
  task_ids?: string[];        // Paperclip identifiers, e.g. ["CRE-393"] —
                               // every one of these gets the "Bree chose…"
                               // comment and wake when a button fires.
  waiting_since?: string;     // ISO timestamp
  deadline?: string | null;   // ISO timestamp — drives the "Due …" pill and
                               // the page's own "Cutoff" line
  options?: string[];         // button labels, first one renders primary
  link?: string | null;       // card title becomes a link to this

  // CRE-393: which button set/behavior the card gets. Omit for the plain
  // "options are just buttons that record a choice" behavior.
  action_type?:
    | "merge"            // see "Merge" below — repo/pr_number required
    | "approve_skip"     // no special handling beyond the generic relay
    | "email_draft"
    | "sql_or_lovable"   // e.g. options: ["I ran it", "Do it later"]
    | "send_hold"        // e.g. options: ["Approve send", "Hold"]
    | "cancel_keep"      // e.g. options: ["Cancel it", "Keep"]
    | "yes_no";

  // "merge" only:
  repo?: string;         // "owner/name", e.g. "tambriakemp/straight-copy"
  pr_number?: number;
  branch?: string;       // defaults to the PR's own head ref if omitted
  base_branch?: string;  // defaults to the PR's own base ref if omitted
}
```

Every type except `merge` is handled identically server-side: whichever
button Bree clicks gets relayed to Ara, who posts **"Bree chose "`<option>`"
from Decide"** on every issue in `task_ids` and wakes its agent (posting a
comment is what wakes it — no separate wake call). `action_type` only
changes which buttons `DecideCard` renders; add a new one in
`src/components/admin/cv/DecideCard.tsx` if a future case needs genuinely
different buttons, not just different labels.

**`approve_skip` also writes back to `prospect_approvals` when it can.**
CRE-393 bug fix (2026-10-12): if any entry in `task_ids` matches a
`prospect_approvals` row's `rebuild_issue_identifier` column (stamped by
`create-rebuild-issue` when it opens the `[Rebuild] <company> - <slug>`
issue), `decide-action` updates that row's `status` — "approved" if the
clicked option's text contains "approve", "rejected" otherwise — along with
`decided_at`/`decided_by`/`updated_at`, the same fields `/admin/approvals`
itself writes. No match just no-ops this step, same as before the fix, so
an `approve_skip` card about something other than a prospect rebuild is
unaffected. This is the only `action_type` with a second side effect beyond
the Ara relay.

**Every pick also persists to `brief_item_completions`.** The frontend
(`Today.tsx`'s `handleDecidePick`) calls `complete-brief-item` after a
successful pick/merge, keyed by the card's own `id` — this is what makes
the card actually stay gone across a reload, since the brief's `approvals`
array is static and the decide_actions audit row isn't read by the page.
An agent adding a new card doesn't need to do anything for this half; it's
entirely the frontend's job once the card's `id` is stable across brief
regenerations (see the `id` field note above).

## Merge

Set `action_type: "merge"`, `repo`, and `pr_number` (omit `options` — the
button is always "Merge"). The `decide-action` edge function:

1. Reads the PR and its check runs from GitHub (needs `github_token` in
   `app_secrets`, set from `/admin/tokens` → Keys).
2. Refuses outright, no override, if `repo`/`branch`/`base_branch` matches
   the Menovia Phase 2 main-merge guard.
3. If `repo` is on the auto-merge list (`tambriakemp/straight-copy` as of
   this writing), merges immediately once CI passes — refuses with the CI
   state otherwise.
4. Otherwise returns `needsConfirm` with a file/line/CI summary; the card
   shows "Merge PR #N into `<branch>`?" and only merges after a second
   click.
5. Squash-merges via the GitHub REST API, reports success/failure back to
   Ara the same way as any other pick, and writes a `decide_actions` row
   either way.

## Extra buttons every card gets for free

"Not now" (snooze 1 day) and "Until Monday" write directly to
`decide_snoozes` — no agent involvement, the row just stops rendering until
the snooze expires. "Ask a question" posts free text through the same
Ara-relay path as a pick (`type: "decide_question"`), so answer it the same
place you'd see "Bree chose…".

## Why relayed through Ara, not posted to Paperclip directly

A browser-triggered Supabase edge function has no Paperclip heartbeat run
to attribute a comment to — posting directly 403s with
`cross_issue_influence_run_context_required` (discovered on CRE-335 building
`complete-brief-item`, the same pattern this reuses). Ara already has a
live, run-scoped way to post on an issue, so every edge function in this
repo that needs to touch Paperclip relays through her webhook
(`ara_webhook_url`/`ara_webhook_key` in `app_secrets`) instead.
