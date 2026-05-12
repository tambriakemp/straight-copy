# SureCart Invoices Tied to Projects

Lets an admin define a payment schedule on any project (initially App Development), generate each invoice in SureCart with one click, show the active unpaid invoice in the portal with a Pay Now link, and auto-mark paid via the existing SureCart webhook.

## Database

New table `project_invoices`:
- `id`, `client_id`, `client_project_id`
- `sequence` (1, 2, 3…), `label` (e.g. "Deposit", "Milestone 2", "Final")
- `amount_cents`, `currency` (default `usd`)
- `due_date` (nullable)
- `status`: `scheduled` | `sent` | `paid` | `void` | `failed`
- `surecart_checkout_id`, `surecart_invoice_id`, `surecart_order_id` (nullable until sent)
- `checkout_url` (hosted SureCart pay link)
- `sent_at`, `paid_at`, `voided_at`
- `notes`, `created_at`, `updated_at`
- RLS: `Admins manage project_invoices` + `Service role manages project_invoices` (mirrors `client_proposals`)
- Indexes on `client_project_id`, `(client_id, status)`, `surecart_checkout_id`

No changes to existing tables.

## Edge function: `project-invoices`

Single function with actions (mirrors `proposal-sign` pattern, `verify_jwt = false`, in-code admin auth):
- `list` — list invoices for a project
- `schedule` — admin upserts the schedule (array of `{sequence, label, amount_cents, due_date}`); creates `scheduled` rows
- `send` — for one scheduled invoice: call SureCart to create a hosted checkout, save `surecart_checkout_id` + `checkout_url`, set status `sent`, stamp `sent_at`
- `void` — mark `void` (and best-effort cancel in SureCart if possible)
- `portal-active` — public-ish endpoint (by `clientId`) returning the single current invoice the portal should show: the lowest-sequence non-`paid`/non-`void` invoice with `status = 'sent'`. No PII beyond label/amount/due/checkout_url.

SureCart call for `send` uses `https://api.surecart.com/v1` with `SURECART_API_TOKEN` (already configured). We'll create a one-time checkout for the line item amount tied to the client's existing `surecart_customer_id` when present, otherwise to `contact_email`. Exact endpoint shape will be confirmed against SureCart docs at implementation time; the function isolates that call so the rest of the system is unaffected.

## Webhook sync

Extend `supabase/functions/surecart-webhook/index.ts`:
- On `checkout.paid` / `order.paid` / `invoice.paid` events, look up `project_invoices` by `surecart_checkout_id` (and fallbacks: `surecart_order_id`, `surecart_invoice_id`).
- If matched: set `status = 'paid'`, `paid_at = now()`, store `surecart_order_id`. Idempotent on repeated events.
- Existing onboarding-invite logic stays intact — invoice matching runs first and short-circuits when matched.

## Admin UI

In `src/pages/admin/AppDevelopmentView.tsx` (and reusable for other project types later), add a **Payment schedule** card above proposals:
- Empty state: "Set up payment schedule" → modal to add rows (label, amount, due date).
- Populated: table of invoices with `sequence`, `label`, amount, due date, status pill, action buttons:
  - `scheduled` → **Send invoice** (calls `send`)
  - `sent` → **Copy pay link**, **View in SureCart**, **Void**
  - `paid` → timestamp + receipt link
- Inline edit for scheduled rows; sent/paid rows are locked.

## Portal UI

New `src/components/portal/InvoiceSection.tsx` rendered in `src/pages/Portal.tsx` near `ProposalsSection`:
- Calls `project-invoices` `portal-active` for the client.
- If an active invoice exists: editorial card with label, amount, due date, **Pay now** button → `checkout_url` (opens new tab).
- If none active: section hidden.
- Past paid invoices are intentionally not shown (per "Current invoice only").

## Out of scope
- Partial payments, refunds UI, tax handling, multi-currency switching.
- Editing already-sent invoices (must void + re-send).
- A full payments history view in the portal.

## Files

**New**
- `supabase/migrations/<ts>_project_invoices.sql`
- `supabase/functions/project-invoices/index.ts`
- `supabase/functions/project-invoices/deno.json`
- `src/components/admin/ProjectInvoicesCard.tsx`
- `src/components/portal/InvoiceSection.tsx`

**Edited**
- `supabase/config.toml` (`[functions.project-invoices] verify_jwt = false`)
- `supabase/functions/surecart-webhook/index.ts` (paid-event matcher)
- `src/pages/admin/AppDevelopmentView.tsx` (mount card)
- `src/pages/Portal.tsx` (mount section)

## Confirm before I build
1. **Default schedule** for the $15k app dev: prefill **3 × $5,000** with no due dates, admin can edit. OK?
2. **Currency** USD only for now?
