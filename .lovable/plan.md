## Goal

Two related changes:
1. Let each client have multiple contacts. The existing `contact_name` / `contact_email` / `contact_phone` becomes the primary contact (migrated into a new table; old columns are kept untouched for now to avoid breaking the many places that read them).
2. Replace the hardcoded HTML in the "Send review email" flow with a SureContact template so every send appears in the contact's SureContact activity history with the same template, and let the admin pick which contact to send it to.

## 1. Database

New migration:

- `client_contacts` table: `id`, `client_id`, `name`, `email`, `phone`, `role` (free-text label like "Owner", "Marketing"), `is_primary` (bool), `surecontact_contact_uuid` (text, nullable), `order_index`, `created_at`, `updated_at`.
- Partial unique index so only one `is_primary = true` per `client_id`.
- Admin + service_role RLS, GRANTs to authenticated + service_role.
- Backfill: for every client where `contact_email` is set, insert a row marked `is_primary = true` carrying the existing name/email/phone and the existing `surecontact_contact_uuid`.
- `app_settings` (single-row) gains a `review_email_template_uuid` column to remember which SureContact template the review email uses. If `app_settings` doesn't exist, create it as a one-row keyed table.

The old `clients.contact_*` columns are NOT dropped — `sync-client-to-surecontact`, intake flows, and several admin pages still read them. They will be kept in sync from the primary contact going forward.

## 2. SureContact template

New edge function `create-surecontact-review-template` (admin-gated):
- POSTs to `https://api.surecontact.com/api/v1/public/email-templates` to create a transactional template named "Site Preview Ready" with the existing review-email HTML, but with merge tokens: `{{first_name}}`, `{{portal_url}}`, `{{preview_url}}`, `{{business_name}}`, `{{client_name}}`.
- Saves the returned `uuid` into `app_settings.review_email_template_uuid`.
- Idempotent: if a uuid is already stored and still exists, it just returns it.

Updated `send-preview-review-email`:
- New required param: `contact_id` (a row from `client_contacts`).
- Loads the contact, builds variables, and calls SureContact `/emails/send` with `template_uuid` + `variables` instead of raw `subject` + `body`.
- Falls back to inline HTML only if no template uuid is configured (so the feature keeps working before the admin clicks "create template").

## 3. Admin UI (`src/pages/admin/ClientDetail.tsx`)

In the client edit panel:
- New "Contacts" section showing a list of contacts with name / email / phone / role / primary badge.
- Add, edit, delete, and "Make primary" actions. Saves go through Supabase directly (admin RLS).
- When the primary changes, mirror that contact's name/email/phone back onto `clients.contact_*` so existing flows keep working.

In `src/pages/admin/PreviewDetail.tsx` "Send review email" button:
- Replace `window.confirm` with a small dialog that lists the client's contacts (radio buttons), defaulting to the primary.
- On confirm, call `send-preview-review-email` with `{ preview_project_id, contact_id }` and keep the existing loading/success/error toasts.
- Add a one-time "Create SureContact template" admin action (small button in Settings or top of PreviewDetail) so the user can wire up the template; once stored, sends use the template automatically.

## 4. Out of scope

- Dropping the legacy `contact_*` columns on `clients` (would touch ~10 files; can be a follow-up).
- Per-contact SureContact sync (only the primary keeps syncing for now; non-primary contacts are local-only until the user asks).
- Other transactional emails (welcome, kickoff, etc.) — same pattern can be applied later if wanted.

## Technical notes

- SureContact template create endpoint expects `name`, `subject`, `body_html`, and optional `type: "transactional"`. Variables use `{{name}}` syntax in the body and are passed in `variables` on `/emails/send`.
- Backfill SQL:
  ```sql
  INSERT INTO public.client_contacts (client_id, name, email, phone, is_primary, surecontact_contact_uuid)
  SELECT id, contact_name, contact_email, contact_phone, true, surecontact_contact_uuid
  FROM public.clients
  WHERE contact_email IS NOT NULL AND contact_email <> '';
  ```
- Partial unique index:
  ```sql
  CREATE UNIQUE INDEX client_contacts_one_primary_per_client
    ON public.client_contacts (client_id) WHERE is_primary;
  ```
