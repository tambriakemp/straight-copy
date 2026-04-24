

## Plan: Auto-send Onboarding Invite on SureCart Purchase

When a customer completes a SureCart checkout, automatically create an onboarding invite and email them the unique link.

### How it works

```text
SureCart checkout paid
        │
        ▼
SureCart webhook  ──►  /functions/v1/surecart-webhook
                              │
                              ├─ verify signature
                              ├─ map product → tier (launch / growth)
                              ├─ create onboarding_invites row
                              └─ send branded email with /onboarding?invite=TOKEN
                                        │
                                        ▼
                              Customer clicks link → resumable chat
```

### 1. New edge function: `surecart-webhook`

- Public endpoint (`verify_jwt = false`) at `/functions/v1/surecart-webhook`
- Listens for SureCart `order.paid` / `checkout.completed` events
- Verifies the webhook signature using a `SURECART_WEBHOOK_SECRET` you'll provide
- Extracts: customer email, name, product/price ID, order ID
- Maps product ID → `tier` (`launch` or `growth`) using a small lookup you configure
- Idempotent: if an invite already exists for that order ID, returns the existing one (so SureCart retries don't duplicate)
- Inserts a row into `onboarding_invites` with a fresh random token, pre-filled name/email, 30-day expiry, and `note` like "Auto-created from SureCart order #1234"
- Calls `send-transactional-email` with a new template (below) to deliver the link

### 2. New email template: `onboarding-invite`

Branded React Email template matching your editorial cream/ink aesthetic. Includes:
- Personal greeting ("Welcome, {name}")
- Short paragraph: thanks for joining {tier} tier, here's your onboarding link
- Big button → `https://cre8visions.com/onboarding?invite={token}`
- Note that the link saves progress and can be reopened anytime
- Unsubscribe footer (auto-handled by existing email infra)

### 3. Database addition (small migration)

Add two optional columns to `onboarding_invites` to track the SureCart origin:
- `source_order_id` text — for idempotency lookup
- `tier` text — `launch` / `growth` so it carries through to the auto-created client

Update `create_client_from_onboarding` trigger to read `tier` from the linked invite (instead of hardcoding `launch`) so Growth customers land in the correct tier automatically.

### 4. Admin UI tweak

On `/admin/invites`, show a small "via SureCart · order #1234" tag on auto-generated invites so you can tell them apart from manually-created ones.

### 5. Configuration (a one-time setup, after this ships)

You'll need to:
1. Add a runtime secret `SURECART_WEBHOOK_SECRET` (shown to you when you create the webhook in SureCart's dashboard — I'll prompt you with the secrets tool)
2. Tell me your SureCart product IDs and which tier each maps to (Launch vs Growth) — I'll hardcode the map in the webhook function (or store it as a small config table if you want to edit it without redeploying)
3. In SureCart's dashboard, add a webhook pointing to:
   `https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/surecart-webhook`
   subscribed to `order.paid` (and optionally `checkout.completed` as backup)

### Files to create / edit

**New**
- `supabase/functions/surecart-webhook/index.ts` + `deno.json`
- `supabase/functions/_shared/transactional-email-templates/onboarding-invite.tsx`
- Migration: `source_order_id` + `tier` columns on `onboarding_invites`, updated trigger

**Edited**
- `supabase/functions/_shared/transactional-email-templates/registry.ts` — register new template
- `supabase/config.toml` — `[functions.surecart-webhook] verify_jwt = false`
- `src/pages/admin/Invites.tsx` — show SureCart origin tag

### MCP question — short answer

MCP connectors (Notion, Linear, Slack, etc.) extend **me** while I'm building — they don't run in your deployed app. SureCart isn't in the MCP catalog, but even if it were, it'd be the wrong tool here. SureCart's own webhook system is the standard, reliable way to react to payments in production, and that's what this plan uses.

### Out of scope (ask if wanted)
- Refund handling (revoke the invite if a payment is refunded)
- Sending the invite to a different email than the buyer (e.g. agency buying for a client)
- Slack/Discord notification to your team when a new paid invite is created
- A small admin page to edit the product → tier mapping without redeploying

