## Goal
When a SureCart order completes for the **Web Development** product (`5b5d573d-f503-4966-bdd8-9b054eca6856`), auto-create a `web_development` project under the matching client — reusing the client if their email is found, creating a new one if not. No onboarding invite email is sent.

## Webhook changes (`supabase/functions/surecart-webhook/index.ts`)

1. Add a constant for the Web Dev product ID and detect it from the first line item's product:
   ```ts
   const WEB_DEV_PRODUCT_ID = '5b5d573d-f503-4966-bdd8-9b054eca6856'
   ```
2. On `order.paid` / `checkout.completed` / `invoice.paid`, **before** the existing onboarding-invite branch, check if `productId === WEB_DEV_PRODUCT_ID`. If yes, run the new Web Dev flow and `return` — do not fall through to invite creation or email send.

## Web Dev flow

1. **Idempotency**: look up `client_projects` where `notes` contains the SureCart order id (or add a small `source_order_id` text column — see "DB" below). If a project already exists for this order, return early.
2. **Find existing client** by email (case-insensitive). Match against either:
   - `clients.contact_email`, OR
   - `client_contacts.email` (then resolve the parent `client_id`).
   
   Use two `.select()` queries with `.ilike('contact_email', email)` and `.ilike('email', email)`. First hit wins; prefer non-archived.
3. **Create client if missing** with: `business_name` (from `customer.company` if SureCart provides it, else null), `contact_name` (full name), `contact_email`, `contact_phone`, `tier: 'launch'` (default — Web Dev is one-time, not a tier), `surecart_order_id`, `surecart_customer_id`, `pipeline_stage: 'intake_submitted'`. Do **not** set `surecart_subscription_id` (one-time purchase).
4. **Create the project**:
   - `client_id`: matched or new
   - `type: 'web_development'`
   - `name`: `"Web Development - " + (client.contact_name || client.business_name || 'Client')`
   - `status: 'active'`
   - `notes`: `"Auto-created from SureCart order #${orderNumber}"`
5. **Skip** the onboarding invite insert and the `send-transactional-email` invoke entirely for this product.
6. Return `{ ok: true, web_dev: true, client_id, project_id, reused_client: boolean }`.

## DB migration (small, one column)

Add `source_order_id text` to `client_projects` with a partial unique index so re-deliveries of the same SureCart webhook don't create duplicate projects:
```sql
ALTER TABLE public.client_projects ADD COLUMN source_order_id text;
CREATE UNIQUE INDEX client_projects_source_order_id_uidx
  ON public.client_projects(source_order_id) WHERE source_order_id IS NOT NULL;
```
No new RLS or GRANTs needed (table already has them). The idempotency check in the webhook becomes a simple `.eq('source_order_id', orderId).maybeSingle()`.

## Out of scope
- No UI changes — the new project appears automatically on the client's existing project list / Dashboard.
- No subscription-status syncing (Web Dev is one-time).
- Existing Launch/Growth tier flow is untouched.

## Verification
- Trigger a SureCart test webhook with the Web Dev product → confirm one project row appears under the correct client (new or existing); re-fire same event → no duplicate; no email sent; existing Launch purchase flow still creates an invite as before.
