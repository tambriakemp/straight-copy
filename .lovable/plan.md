## Problem

Menovia's deposit invoice (`Deposit: Web App`, $5,000) was paid in SureCart, but our `project_invoices` row is still `status: sent`.

Root cause: every recent call to the `surecart-webhook` edge function returned **401 invalid_signature**. The webhook never reached the `project_invoices` matcher, so the row was never updated. The matcher logic itself is correct — `surecart_invoice_id` and `surecart_checkout_id` are populated on the row, so a valid event would flip it to `paid` immediately.

There are two things to do: backfill the missed payment, and stop future events from being rejected.

## Plan

### 1. Backfill Menovia's deposit (one-off SQL)

Mark the existing row paid so the portal and admin reflect reality now:

- `project_invoices.id = 891c072b-2000-4ac1-a123-88d8fdd60621`
- set `status = 'paid'`, `paid_at = now()`

### 2. Fix the signature verifier in `supabase/functions/surecart-webhook/index.ts`

Current code only accepts an HMAC-SHA256 **hex** digest (or a `t=…,v1=…` Stripe-style header). SureCart actually sends the signature as **base64**, which is why every real event fails verification.

Update `verifySignature` to:

- Compute HMAC-SHA256 of the raw body with `SURECART_WEBHOOK_SECRET`.
- Compare the header against **both** the hex digest and the base64 digest (timing-safe).
- Keep the existing `t=…,v1=…` parsing as a fallback.
- Keep accepting both `x-surecart-signature` and `surecart-signature` header names.
- On failure, log the header format we received (length + first/last 4 chars only, no secret) so future mismatches are diagnosable.

No other logic in the function changes — the existing `project_invoices` upsert path already handles `invoice.paid`, `checkout.paid`, and `order.paid`.

### 3. Verify

- Deploy the webhook function.
- Trigger a test event from SureCart (or replay the Menovia payment from the SureCart dashboard) and confirm:
  - Edge log shows `200` instead of `401`.
  - A second test invoice flips to `paid` automatically end-to-end.

### Technical notes

- Secret name in env: `SURECART_WEBHOOK_SECRET` (already configured).
- The webhook is `verify_jwt = false` (public endpoint) — unchanged.
- Backfill is idempotent: webhook code already checks `if (invRow.status !== 'paid')` before updating, so a late-arriving real event after the manual update will be a no-op.
