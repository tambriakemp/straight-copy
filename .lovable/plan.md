## Context

SureContact's **public API does not have** a "list email templates" or a "send template to contact" endpoint. The only way to trigger a templated email to a single contact via API is through **Automations**:

- `GET /api/v1/public/automations` — list all automations in the workspace (this is the closest thing to "list templates" — each kickoff/welcome/etc. email lives inside an automation in SureContact)
- `POST /api/v1/public/contacts/{contact_uuid}/automations/{automation_uuid}/start` — manually enroll a contact into an active automation

So the migration path is: **replace the incoming-webhook fire with a "start automation" API call**, using a kickoff-specific automation UUID stored as a secret.

## Currently webhook-triggered (in this codebase)

Searching the repo for `incoming-webhooks` / `surecontact.com/incoming-webhooks` shows **only one** SureContact incoming-webhook fire:

- `supabase/functions/trigger-kickoff-webhook/index.ts` → kickoff confirmation

(All other transactional sends are already API-based — `submit-contact`, `sync-client-to-surecontact`, `send-transactional-email`, etc.)

So "kickoff" is the only one to migrate right now.

## Plan

### 1. Add a small admin tool to list available SureContact automations

So you can pick the kickoff automation UUID without leaving the app.

- New edge function `list-surecontact-automations` (`verify_jwt = false`, gated by admin check via Supabase auth in the function — same pattern the other admin endpoints use):
  - Calls `GET https://api.surecontact.com/api/v1/public/automations` with `X-API-Key: SURECONTACT_API_KEY`
  - Returns `[{ uuid, name, status }, ...]`
- Surface this in the existing admin UI as a small "SureContact Automations" panel inside `src/pages/admin/Profile.tsx` (or a new minimal `Integrations` section), with a copy-to-clipboard button on each UUID.

### 2. Store the kickoff automation UUID as a secret

Add `SURECONTACT_KICKOFF_AUTOMATION_UUID` via the secrets tool. You'll paste the UUID after using the listing tool above.

### 3. Rewrite `trigger-kickoff-webhook` to use the Automation API

Keep the function name (so the DB trigger `fire_kickoff_webhook` and admin "re-fire" buttons keep working unchanged), but swap the body:

1. Look up client (same as today) + gating + idempotency check on `clients.kickoff_webhook_fired_at`.
2. **Upsert contact** in SureContact via the existing `upsertSureContact` shared helper — guarantees the contact exists and tags/custom fields are current. Capture the returned `contact_uuid` from the upsert response (SureContact returns the contact in the response).
3. **Start automation**: `POST /api/v1/public/contacts/{contact_uuid}/automations/{SURECONTACT_KICKOFF_AUTOMATION_UUID}/start` with `X-API-Key`.
4. On success:
   - Stamp `clients.kickoff_webhook_fired_at = now()` (unchanged).
   - Insert into `email_send_log`:
     ```
     template_name: 'kickoff-confirmation'
     recipient_email: client.contact_email
     status: 'api_triggered'   // (new status string, parallel to 'webhook_fired')
     metadata: { client_id, automation_uuid, contact_uuid, surecontact_response }
     ```
   - Keep the existing `schedulePollRetries(...)` background polling so `intake.kickoff_confirmation_sent` still flips when SureContact records the actual send activity.
5. On failure: log to `email_send_log` with `status: 'failed'`, return 502 with the SureContact error body — same shape as today, so the admin UI's existing error display keeps working.

### 4. Update `_shared/surecontact.ts`

Extract the contact UUID from SureContact's upsert response (it's in `data.contact.uuid` / `data.data.uuid` depending on shape — function will check both). Add a small helper `extractContactUuid(result)` so the kickoff function and any future automation-trigger functions can reuse it.

### 5. Leave alone (per your scope)

- Welcome sequence (still tag-driven) — no change.
- `sync-client-to-surecontact` stage tags — still written for segmentation; no automation trigger added.
- Other transactional emails already going through the API.

## Technical notes

- SureContact requires the **automation to be in `active` status** or the start call returns 422 — surface that error message verbatim in the admin "re-fire" toast so you know to flip it on in SureContact.
- The new `list-surecontact-automations` function reuses the existing `SURECONTACT_API_KEY` secret — no new secrets needed for the listing tool. Only the kickoff UUID secret is new.
- DB trigger `fire_kickoff_webhook` and `auto_complete_journey_node` gating logic are unchanged — they still call the same edge function name, just with a new internal implementation.
- Idempotency marker (`kickoff_webhook_fired_at`) keeps its current name; treat it as "kickoff API-triggered at" going forward — no migration needed.

## Files

- **New**: `supabase/functions/list-surecontact-automations/index.ts` (+ `deno.json`, + `config.toml` entry with `verify_jwt = false`)
- **Edit**: `supabase/functions/trigger-kickoff-webhook/index.ts` — swap webhook fetch for upsert + start-automation calls
- **Edit**: `supabase/functions/_shared/surecontact.ts` — add `extractContactUuid` helper
- **Edit**: `src/pages/admin/Profile.tsx` (or new section) — list automations with copy-UUID buttons
- **Secret request**: `SURECONTACT_KICKOFF_AUTOMATION_UUID`

## Order of operations after approval

1. Build the listing function + admin UI panel and deploy.
2. You open the panel, copy the kickoff automation UUID.
3. I prompt you to add `SURECONTACT_KICKOFF_AUTOMATION_UUID` as a secret.
4. Once the secret is in, I rewrite `trigger-kickoff-webhook` and deploy.
5. Test on a client (the existing "Re-fire kickoff" admin action will exercise the new path).
