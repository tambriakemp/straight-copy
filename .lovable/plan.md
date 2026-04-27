
# Scheduled email-activity polling with auto-pause

## Goal

Stop hitting SureContact every time the Intake panel opens. Instead, run a single scheduled job that sweeps **only the clients who still have something to discover**, and stops touching a client the moment all five tracked emails are confirmed sent + opened (or the project is complete/archived/canceled).

## How it decides who to poll

A client is **eligible** for polling only if ALL of these are true:

- `archived = false`
- `subscription_status` is null OR in (`active`, `trialing`, `past_due`) — never `canceled`
- The client has either a `surecontact_contact_uuid` or a `contact_email` to look up
- They are NOT "fully tracked" yet (see below)
- They are NOT "stale" (see below)

A client is **fully tracked** when a new `client_email_tracking` row shows all five emails marked both sent and opened — at that point we set `email_tracking_complete_at` on the client and the cron skips them forever.

A client is **stale / shipped** when their delivery node is complete AND it's been more than 14 days since `delivery_date` — the delivery email almost certainly fired by then; if SureContact still hasn't reported it, more polling won't help. We mark `email_tracking_paused_at` with reason `delivery_window_passed` and stop.

There is also a manual override field `email_tracking_paused_at` (admin-set) — if non-null, skip.

## Cadence (tiered, not flat)

One cron job runs every 15 minutes, but per-client it polls on a back-off based on how recently the client started their journey:

| Client age (since `created_at`) | Poll interval |
|---|---|
| 0–48 hours | every 15 min (welcome / scope window) |
| 2–10 days | every 2 hours (kickoff / day-3 window) |
| 10+ days | every 12 hours (delivery window) |

The job picks up clients whose `email_tracking_last_polled_at` is older than their bucket's interval. So even when there are 50 active clients, the actual SureContact API calls per run stay small (usually just the ones that hit their next bucket).

When there are zero eligible clients in a run, the function returns immediately — no API calls, no cost.

## Pieces to build

### 1. Database (migration)

Add to `clients`:
- `email_tracking_last_polled_at timestamptz` — when the cron last hit SureContact for this client
- `email_tracking_complete_at timestamptz` — set once all 5 emails are sent+opened (terminal state)
- `email_tracking_paused_at timestamptz` — manual or auto pause
- `email_tracking_paused_reason text` — `manual`, `delivery_window_passed`, `subscription_canceled`, etc.

New table `client_email_tracking` (one row per client, upserted by the cron — gives us a queryable cache instead of refetching to render UI):
```
client_id uuid pk references clients(id) on delete cascade
welcome_sent_at, welcome_opened_at,
scope_sent_at, scope_opened_at,
kickoff_sent_at, kickoff_opened_at,
day3_sent_at, day3_opened_at,
delivery_sent_at, delivery_opened_at  (all timestamptz nullable)
updated_at timestamptz default now()
```
RLS: admins read, service role manages.

Enable `pg_cron` and `pg_net` extensions.

### 2. New edge function: `poll-email-status` (verify_jwt = false)

Cron-invoked. No body required (or accepts `{ clientId }` for one-off manual runs).

Flow:
1. Service-role client.
2. Select eligible clients using the rules above (single SQL query with the bucket logic baked in via CASE on `now() - created_at`).
3. For each (cap at e.g. 25 per run for safety):
   - Resolve `surecontact_contact_uuid` (lookup + persist if missing — same logic as today).
   - Fetch `email_sent` + `email_opened` activities.
   - Match against the 5 phrases (same matchers as current `check-email-status`).
   - Upsert `client_email_tracking`.
   - Call `flipChecklistItem` for the 3 intake items (idempotent).
   - Update `email_tracking_last_polled_at = now()`.
   - If all 5 sent+opened → set `email_tracking_complete_at = now()`.
   - If past 14d delivery window → set `email_tracking_paused_at` + reason.
4. Return `{ scanned, polled, completed, paused, errors }` for log visibility.

Add `[functions.poll-email-status] verify_jwt = false` to `supabase/config.toml`.

### 3. Cron job (via insert, not migration — contains anon key)

```sql
select cron.schedule(
  'poll-surecontact-email-status',
  '*/15 * * * *',
  $$ select net.http_post(
       url := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/poll-email-status',
       headers := '{"Content-Type":"application/json","Authorization":"Bearer <ANON>"}'::jsonb,
       body := '{}'::jsonb
     ); $$
);
```

### 4. Repurpose `check-email-status` → instant manual refresh

Keep the function but slim it down to call `poll-email-status` for a single `clientId` (or just read from `client_email_tracking` and return). This gives admins a "Check now" path without bypassing the eligibility / polling cadence logic.

### 5. UI changes in `ClientDetail.tsx`

- Remove the `useEffect` that fires `check-email-status` on every Intake panel open.
- Read email status from `client_email_tracking` (already loaded with the client) and display "Last checked: HH:MM" + a small "Refresh" button that invokes `check-email-status` for one-off manual runs.
- Add a small toggle on the Intake panel header: **Pause email tracking** / **Resume**. Sets `email_tracking_paused_at` to `now()` or null with reason `manual`. So the admin can kill polling for a specific client at any time.

### 6. Auto-pause hook (already partially there)

The existing `trg_clients_surecontact_sync` trigger already fires on certain field changes. Add a small trigger (or extend an existing one) so that when:
- `archived` flips to true, OR
- `subscription_status` changes to `canceled`

…we set `email_tracking_paused_at = now()` with the corresponding reason. Cleanly stops polling without admin intervention.

## What stays the same

- All matcher phrases and intake checklist auto-flip behavior.
- `flipChecklistItem` helper — unchanged.
- `sync-client-to-surecontact` UUID persistence — unchanged.
- Existing manual checkboxes — unchanged.

## Files

**New**
- `supabase/migrations/<ts>_email_tracking_state.sql` — columns + new table + extensions
- `supabase/functions/poll-email-status/index.ts` + `deno.json`

**Edited**
- `supabase/config.toml` — register `poll-email-status`
- `supabase/functions/check-email-status/index.ts` — slim down to single-client refresh
- `src/pages/admin/ClientDetail.tsx` — remove auto-invoke, render cached state, add Refresh + Pause UI

**Insert (not migration)** — cron schedule with anon key

## Open question

**Manual "Refresh" button on the Intake panel** — keep it (admins can force a check anytime) or remove it entirely and trust the schedule? My recommendation: keep it, since admins occasionally need to confirm a specific email landed without waiting up to 15 min.
