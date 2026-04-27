## Goal

Let a client cancel their plan from the portal with a button — no trip to SureCart — by calling the SureCart REST API server-side from a Supabase Edge Function.

## Is it possible?

Yes. SureCart exposes a public REST API at `https://api.surecart.com/v1` with a `POST /subscriptions/{id}/cancel` endpoint (and a `DELETE /subscriptions/{id}` for immediate cancel). It requires a SureCart **API token** (created in SureCart → Settings → Advanced → API Tokens). Once we have the subscription ID for each client and that token, we can cancel from our backend.

## What's missing today

1. We don't store the SureCart **subscription ID** or **customer ID** on the `clients` table — the webhook today only uses the order to create an onboarding invite.
2. No SureCart API token secret is configured.
3. No cancel UI in the portal, no edge function to call SureCart.

## Plan

### 1. Capture subscription + customer IDs

- Add columns to `clients`:
  - `surecart_subscription_id text`
  - `surecart_customer_id text`
  - `surecart_order_id text`
  - `subscription_status text` (active, canceled, past_due, etc.)
  - `subscription_canceled_at timestamptz`
  - `subscription_cancel_at_period_end boolean default false`
- Update `surecart-webhook` to:
  - Persist these fields when an order/subscription event comes in (match by `contact_email` or by the existing onboarding link).
  - Handle `subscription.updated` / `subscription.canceled` / `subscription.revoked` events to keep `subscription_status` in sync.

### 2. Add the SureCart API token

- Ask user to create a token in SureCart and add it as `SURECART_API_TOKEN` via the secrets tool.

### 3. New edge function: `cancel-subscription`

- Auth: requires the logged-in client (validates the Supabase JWT, looks up their `client_id`).
- Loads the client's `surecart_subscription_id`.
- Offers two modes (we pick one as the default in the UI):
  - **Cancel at period end** (recommended) — `POST https://api.surecart.com/v1/subscriptions/{id}/cancel` with `{ "cancel_at_period_end": true }`. Client keeps access until the renewal date.
  - **Cancel immediately** — same endpoint without the flag, or `DELETE`.
- On success, updates `clients.subscription_status` and `subscription_canceled_at`.
- Returns the new status to the UI.

### 4. Portal UI

In `src/pages/Portal.tsx` (or a new `SubscriptionSection` component):

- Show current plan + status pulled from `clients` (Launch / Growth, "Active until …" / "Cancels on …").
- "Cancel subscription" button → opens an `AlertDialog` confirmation explaining:
  - What they lose access to
  - That the cancellation takes effect at the end of the current billing period
- On confirm, calls `supabase.functions.invoke('cancel-subscription')`.
- After success, swaps the button for a "Resume subscription" CTA (optional — SureCart supports `POST /subscriptions/{id}/resume` to undo a pending cancel before the period ends).

### 5. Admin visibility

- Surface `subscription_status` and a "Cancel on behalf of client" button in `src/pages/admin/ClientDetail.tsx` so you can also cancel from the admin side if needed.

## Open questions before building

1. **Default cancel behavior** — cancel at period end (client keeps access until renewal) or immediate (access cut off the moment they click)?
2. **Allow resume** — should the portal offer a "Resume" button if they cancel and change their mind before the period ends?
3. **Existing clients** — for clients already in the database who don't have a `surecart_subscription_id` yet, do you want me to add an admin field to paste it in manually, or rely only on new orders going forward?

Once you confirm those, I'll add the migration, secret, edge function, and portal UI.
