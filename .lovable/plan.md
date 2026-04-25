## Goal

Use SureContact as the email engine for client lifecycle emails (welcome, kickoff, etc.) while still personalizing each email with that client's unique portal link (`https://cre8visions.com/portal/{clientId}`). SureContact gets the link as a **custom field on the contact record**, so any template you build in SureContact can merge it with a normal merge tag.

This keeps SureContact as the source of truth for sends + analytics — Lovable's job is just to keep the contact record (and that one custom field) in sync.

---

## How it works

1. When a client is created (or their portal info changes), Lovable upserts the contact in SureContact with a custom field `portal_url` containing their unique link.
2. You build the welcome / kickoff / re-engagement emails inside SureContact using a merge tag like `{{custom.portal_url}}` (or whatever syntax your SureContact account uses — to be confirmed in step 4).
3. Sending, scheduling, opens, clicks, and the rest of the analytics all live inside SureContact. Lovable doesn't send the email — it just guarantees the link is always there before SureContact sends.
4. Optional: tag/list assignment per stage (e.g. tag `Portal: Onboarding`, `Portal: Brand Kit`, `Portal: Kickoff`) so you can trigger SureContact automations off journey progress.

---

## What gets built

### 1. New shared helper: `supabase/functions/_shared/surecontact.ts`
A single `upsertSureContactClient({ client, portalUrl, tags?, lists? })` helper that POSTs to the same `/api/v1/public/contacts/upsert` endpoint already used by `submit-contact`. It will write:
- `primary_fields`: email, first/last name, company (business_name)
- `custom_fields.portal_url` — the unique portal link
- `custom_fields.client_tier` — launch / growth
- `custom_fields.journey_stage` — current active node label (e.g. "Brand Kit Intake")
- `tags`: e.g. `["Client Portal", "Tier: Growth", "Stage: Brand Kit"]`
- `lists`: configurable, default `["Cre8 Visions Clients"]`

This reuses the existing `SURECONTACT_API_KEY` secret — no new keys needed.

### 2. New edge function: `sync-client-to-surecontact`
- `verify_jwt = false` (called server-side from other functions and from the admin UI with the anon key)
- Input: `{ clientId }`
- Loads the client from `public.clients`, computes the portal URL using a `PORTAL_BASE_URL` env (defaults to `https://cre8visions.com`), looks up the active journey node, and calls the helper.
- Idempotent — safe to call repeatedly.

### 3. Auto-sync hooks
Wire calls to `sync-client-to-surecontact` into the points where client state changes:
- **On client creation** — extend the existing `create_client_from_onboarding` flow (the trigger fires on `onboarding_submissions` completion). Easiest path: add an `AFTER INSERT` trigger on `public.clients` that calls a small `pg_net` HTTP POST to the new edge function (using the anon key from vault). Falls back gracefully if the call fails — never blocks the insert.
- **On tier change** — extend the existing `sync_journey_nodes_on_tier_change` to also re-sync.
- **On journey node advancement** — extend `auto_complete_journey_node` so when a node is marked complete, the next active node label gets pushed up to SureContact (so `journey_stage` and stage tags stay accurate, which lets SureContact automations trigger off them).
- **Manual re-sync button** in the admin client detail page header next to "Open as client" / "Copy portal link" — fires the function on demand for QA / fixes.

### 4. SureContact dashboard side (you do this once, no code)
After the function is live and at least one client is synced, you'll need to:
- a. Create the custom field `portal_url` (and optionally `client_tier`, `journey_stage`) in SureContact's custom-fields settings — type: text/URL.
- b. Create the lists / tags you want to use (`Cre8 Visions Clients`, `Stage: Brand Kit`, etc.).
- c. Build your welcome email template in SureContact and drop the merge tag for `portal_url` into the CTA button. The exact merge-tag syntax depends on SureContact's editor — most commonly `{{custom_fields.portal_url}}` or `{{contact.custom.portal_url}}`. We'll confirm the exact syntax against a synced contact before you build the template.
- d. Set up the SureContact automation/trigger (e.g. "When tag `Stage: Onboarding` is added → send Welcome email").

I'll give you a short checklist with exact steps after the sync is wired up.

### 5. Where the portal URL comes from
Currently the code uses `window.location.origin` (so admin previews use the lovable.app domain). For emails, that's wrong — clients should always get `cre8visions.com`. The new edge function will use a server-side constant `PORTAL_BASE_URL` (defaulting to `https://cre8visions.com`, overridable via a Supabase secret if you want to point at the staging domain during testing).

---

## What we explicitly are NOT doing

- **Not** sending emails from Lovable / Lovable Cloud for these client lifecycle emails. SureContact is the sender, period. (The existing `send-transactional-email` infra stays in place for things SureContact can't do, like internal admin notifications and the contact-form auto-reply.)
- **Not** building campaign management UI in Lovable — you compose, schedule, and analyze emails inside SureContact.
- **Not** changing the existing public website contact form behavior.
- **Not** touching admin auth, RLS, or the portal itself.

---

## Open questions before I build (only one matters)

**Q: Confirm the SureContact custom-field merge-tag syntax.** Different ESPs use different syntax (`{{custom.portal_url}}`, `{{custom_fields.portal_url}}`, `{{contact.portal_url}}`, `[[portal_url]]`, etc.). I can confirm this two ways:
- (a) You check SureContact's email editor docs / their merge-tag picker and tell me the syntax — fastest, or
- (b) I build the sync, you sync one test client, then we look at how that contact appears in SureContact's contact view to confirm the field name SureContact uses, and you check the editor's merge-tag dropdown.

Either way the sync code is the same — this only affects what you paste into the SureContact email body. Default assumption: `{{custom_fields.portal_url}}`.

---

## Files touched

**New**
- `supabase/functions/_shared/surecontact.ts`
- `supabase/functions/sync-client-to-surecontact/index.ts`
- `supabase/config.toml` — add `[functions.sync-client-to-surecontact] verify_jwt = false`

**Edited**
- `supabase/functions/submit-contact/index.ts` — refactor to use the shared helper (no behavior change)
- `src/pages/admin/ClientDetail.tsx` — add "Sync to SureContact" button in the header banner
- Migration: trigger on `public.clients` AFTER INSERT/UPDATE that calls the edge function via `pg_net`; extend `auto_complete_journey_node` to also fire it on stage advancement

**Untouched**
- All existing portal, onboarding, brand-kit-intake, auth, and email-queue infrastructure.

Approve and I'll switch to build mode and ship it.