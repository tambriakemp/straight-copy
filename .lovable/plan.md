## Goal

When every Node 1 (intake) checklist item except `intake.kickoff_confirmation_sent` is complete, automatically POST to the SureContact incoming webhook:

`https://api.surecontact.com/incoming-webhooks/89ce06f6-cd92-44a6-a8b2-31a01820fc1f`

This fires the kickoff email automation in SureContact. Then poll SureContact's contact activity log until we see the kickoff "sent" event, at which point we flip `intake.kickoff_confirmation_sent` — which (via the existing `auto_complete_journey_node` trigger) closes Node 1 and advances to Node 2.

## How it will work

### 1. New edge function: `trigger-kickoff-webhook`

- `verify_jwt = false` (called from a DB trigger via `pg_net`, same pattern as `sync-client-to-surecontact`).
- Input: `{ clientId }`.
- Loads the client (must be unarchived, has `contact_email`).
- Loads the `intake` node and verifies the gating condition:
  - All items except `intake.kickoff_confirmation_sent` are `done`.
  - `intake.kickoff_confirmation_sent` is NOT yet `done`.
  - `kickoff_webhook_fired_at` is NULL on the client (idempotency guard).
- POSTs JSON to the SureContact incoming webhook URL with the contact's identifying data (email, name, business name, client_id, portal URL, etc.) so the SureContact automation can match the contact and send the kickoff template.
- On success: stamps `clients.kickoff_webhook_fired_at = now()` so we never fire twice.
- Logs to `email_send_log` with `template_name = 'kickoff-confirmation'`, `status = 'webhook_fired'` for visibility.

### 2. New DB columns + trigger

Migration adds two columns to `clients`:
- `kickoff_webhook_fired_at timestamptz`
- `kickoff_webhook_confirmed_at timestamptz` (set when poller sees the SureContact "sent" activity)

Update the existing `auto_complete_journey_node()` function so that, on every checklist write to the intake node, after computing `done_items` it also evaluates a new condition:

> all items except `intake.kickoff_confirmation_sent` are done AND kickoff item is not done AND `clients.kickoff_webhook_fired_at IS NULL`

When true, it calls a new helper `fire_kickoff_webhook(client_id)` (mirrors `fire_surecontact_sync` — uses `net.http_post` to invoke the new edge function). This keeps the gating logic atomic with the checklist write.

Note: the existing trigger already handles cascading node completion when ALL items are done — we don't need to change that. The kickoff item will be flipped later by the poller, which will then satisfy that path naturally.

### 3. Extend `poll-email-status` to confirm the kickoff send

`poll-email-status` already polls SureContact's `email_sent` and `email_opened` activities every 2h (≤48h old) or 12h (older), and matches them by description phrase. The kickoff matcher is already wired:

```
{ key: "kickoff", phrase: "build has officially started",
  intakeItemKey: "intake.kickoff_confirmation_sent" }
```

So as soon as SureContact records the kickoff `email_sent` activity, the poller already calls `flipChecklistItem(client, "intake", "intake.kickoff_confirmation_sent")` — which flips the item to done. The existing `auto_complete_journey_node` trigger then sees all 11 items done and closes Node 1 + advances Node 2. **No changes needed here** beyond stamping `kickoff_webhook_confirmed_at` when the kickoff `sent_at` first appears, for admin visibility.

To make the poller responsive after the webhook fires (default cadence could be 2h), the new edge function will also enqueue an immediate `poll-email-status` invocation for that client right after firing the webhook, and again every ~5 min for the next 30 min via a lightweight loop (or simply rely on the next scheduled tick — see open question below).

### 4. UI surface (ClientDetail intake panel)

Small additions so admins can see what's happening:
- Show "Kickoff webhook fired at <timestamp>" once `kickoff_webhook_fired_at` is set.
- Show "Confirmed sent at <timestamp>" once `kickoff_webhook_confirmed_at` is set.
- Add a manual "Re-fire kickoff webhook" admin action (calls the edge function directly, bypassing the idempotency guard) for recovery.

## Technical details

- **Webhook payload shape** — SureContact incoming webhooks typically accept arbitrary JSON keyed by email. Proposed body:
  ```json
  {
    "email": "...",
    "first_name": "...",
    "last_name": "...",
    "company": "...",
    "client_id": "...",
    "portal_url": "...",
    "trigger": "kickoff_confirmation",
    "tier": "Launch"
  }
  ```
- **Idempotency**: gated by `clients.kickoff_webhook_fired_at IS NULL` in both the DB trigger AND the edge function (defense in depth).
- **Failure handling**: if the POST fails (non-2xx), do NOT stamp `kickoff_webhook_fired_at`, log the error to `email_send_log` with `status = 'failed'`, and let the trigger try again on the next checklist write. If no further writes happen, the manual "Re-fire" button covers it.
- **Files touched**:
  - new: `supabase/functions/trigger-kickoff-webhook/index.ts` + `deno.json`
  - new migration: adds columns + `fire_kickoff_webhook()` + updates `auto_complete_journey_node()`
  - edit: `supabase/config.toml` — add `[functions.trigger-kickoff-webhook] verify_jwt = false`
  - edit: `supabase/functions/poll-email-status/index.ts` — stamp `kickoff_webhook_confirmed_at` when kickoff `sent_at` first detected
  - edit: `src/pages/admin/ClientDetail.tsx` — show webhook status + manual re-fire button

## Open question

After the webhook fires, the poller's normal cadence (2h within 48h of client creation) could delay auto-completion by up to 2 hours. Options:
- **(a)** Accept the 2h worst-case delay — simplest, no extra infra.
- **(b)** Have the trigger function kick off an immediate `poll-email-status` invoke right after the webhook fires, then schedule one more retry ~5 min later via a one-off pg_cron entry. More moving parts but typically completes within 5–10 min.

I'd recommend **(b)** for a snappier UX. Let me know which you'd like before I implement.
