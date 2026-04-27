# Auto-check Node 01 (Intake) checklist from SureContact activity log

## What this does

When the admin opens the Node 01 (Intake) panel for a client, the app calls a new edge function `check-email-status`. That function asks SureContact's activities API which campaign emails have actually been sent to (and opened by) this client, then flips the matching intake checklist items to "done" so the checkmarks appear physically.

No existing functionality is touched — this is additive.

## What gets auto-checked

Of the 5 emails the user listed, **3 live on the Intake node** today and will get auto-checked there:

| Description phrase (in SureContact activity) | Intake checklist item flipped |
|---|---|
| "Welcome to Cre8 Visions" | `intake.welcome_email_sent` (+ `intake.welcome_opened` if email_opened activity exists) |
| "exactly what's included" | `intake.scope_summary_sent` |
| "build has officially started" | `intake.kickoff_confirmation_sent` |

The other 2 — **"Build update" (day 3)** and **"Your AI OS is live" (delivery)** — are returned by the API for completeness but are NOT intake items. They live on the `automation_02` and `delivery` nodes and have no checklist items to flip today. They'll be returned in the response so the UI can show their status, but no auto-flip will happen for them unless we add matching checklist items later (out of scope here, just flagging it).

## Pieces to build

### 1. Store SureContact contact UUID on `clients`

The clients table has no `surecontact_contact_uuid` column today. The activities endpoint needs `{contact_uuid}` in the path. Two-part fix:

- **Migration**: add `surecontact_contact_uuid text` (nullable) to `clients`.
- **Update `sync-client-to-surecontact`**: after a successful upsert, read the contact id from the SureContact response (the upsert response `data` already contains it) and write it back to `clients.surecontact_contact_uuid`. Idempotent — only writes if missing or changed.

This means existing clients will get their UUID populated the next time their record syncs (which fires on most updates). For immediate backfill, the new edge function will fall back to looking the contact up by email if `surecontact_contact_uuid` is null, then save it.

### 2. New edge function: `check-email-status`

`supabase/functions/check-email-status/index.ts`, `verify_jwt = true` (called from authenticated admin UI).

**Input**: `{ clientId: string }`

**Flow**:
1. Auth check (admin only via `is_admin(auth.uid())`).
2. Load client; resolve `surecontact_contact_uuid` (lookup by email + persist if missing).
3. `GET https://api.surecontact.com/api/v1/public/contacts/{uuid}/activities?type=email_sent` with `X-API-Key`.
4. Also fetch `?type=email_opened` for the open status.
5. Match each activity's `description` field against the 5 phrases (case-insensitive `includes`).
6. For each phrase, pick the most recent matching `email_sent` activity for `sent` + timestamp, and check whether any `email_opened` activity matches the same phrase for `opened`.
7. Call the existing `flipChecklistItem()` helper from `_shared/auto-checklist.ts` for the 3 intake items that matched (idempotent — no-op if already done).

**Output**:
```json
{
  "welcome_sent":  { "sent": true,  "sent_at": "...", "opened": true },
  "scope_sent":    { "sent": true,  "sent_at": "...", "opened": false },
  "kickoff_sent":  { "sent": false, "sent_at": null,  "opened": false },
  "day3_sent":     { "sent": false, "sent_at": null,  "opened": false },
  "delivery_sent": { "sent": false, "sent_at": null,  "opened": false }
}
```

Add `[functions.check-email-status] verify_jwt = true` to `supabase/config.toml`.

### 3. Wire it into the Intake panel in `ClientDetail.tsx`

In the existing node modal where `node.key === "intake"`:
- On mount (and when modal reopens), `supabase.functions.invoke("check-email-status", { body: { clientId } })`.
- On a successful response, call `onReload()` so the freshly-flipped checklist items render with checkmarks.
- Silent failure — if SureContact is down, the existing manual checkboxes still work. Console-warn only.

No UI redesign — the checkmarks just start appearing. (Optional small "Last checked HH:MM" line under the checklist; happy to add or skip.)

## Files

**New**
- `supabase/migrations/<ts>_add_surecontact_contact_uuid.sql`
- `supabase/functions/check-email-status/index.ts`
- `supabase/functions/check-email-status/deno.json`

**Edited**
- `supabase/config.toml` — register the new function
- `supabase/functions/sync-client-to-surecontact/index.ts` — persist `surecontact_contact_uuid` from upsert response
- `src/pages/admin/ClientDetail.tsx` — invoke `check-email-status` when intake node opens

## Safety

- All writes are idempotent (`flipChecklistItem` already no-ops if `done === true`).
- Existing manual-check behavior, all other nodes, and the SureContact webhook are untouched.
- Function fails silently on the UI side so a SureContact API hiccup never blocks admin work.
- Auth-gated to admins only.

## Confirm before I build

1. **SureContact response shape**: I'm assuming the upsert response includes the contact UUID at something like `data.contact.id` or `data.id`, and the activities endpoint returns objects like `{ description: "...", created_at: "...", type: "email_sent" }`. If you have a sample response handy, paste it — otherwise I'll log the raw shape on first call and adjust.
2. **Day 3 + delivery items**: do you want me to also add checklist items for those on the `automation_02` and `delivery` nodes so they get auto-checked too? (Right now they only exist conceptually — no checklist row to flip.)
