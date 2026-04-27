# Auto-check intake checklist items from real events

## Problem

The intake checklist shows 4 "auto" email items and 1 "client" open item that are labeled as if the system tracks them, but **nothing flips them today**. The SureContact webhook logs events into `surecontact_events` but never updates `journey_nodes.checklist`. Outbound app emails sent via `send-transactional-email` also don't mark themselves as sent.

Result: those checkmarks stay unchecked forever unless you tick them by hand, which defeats their purpose.

## Goal

Every checklist item with `owner: "auto"` or an event-driven `owner: "client"` item gets a **real, physical checkmark** the moment the actual event occurs — no manual intervention.

## Mapping (event → checklist key)

| Event | Source | Flips |
|---|---|---|
| Welcome email successfully sent | `send-transactional-email` (template `welcome-email` or equivalent) | `intake.welcome_email_sent` |
| Contract email sent for signature | `send-transactional-email` (contract template) OR `contract-sign` when token issued | `intake.contract_sent` |
| Scope summary email sent | `send-transactional-email` (scope summary template) | `intake.scope_summary_sent` |
| Kickoff confirmation email sent | `send-transactional-email` (kickoff template) | `intake.kickoff_confirmation_sent` |
| SureContact `opened` event for welcome email | `surecontact-webhook` matching `campaign_name` | `intake.welcome_opened` |

(`contract_signed`, `contract_countersigned`, `onboarding_completed`, `accounts_submitted` already auto-flip — leaving them untouched.)

## Implementation

### 1. Shared helper: `flipIntakeChecklistItem(clientId, key)`
Add a small helper in `supabase/functions/_shared/` that:
- Loads the active intake `journey_nodes` row for the client.
- Sets the matching checklist item's `done = true` (idempotent — no-op if already done).
- Writes back. The existing `auto_complete_journey_node` trigger handles auto-completing the node when all items are done.

### 2. Update `send-transactional-email`
After a successful send, look up the template name and (if it maps to an intake key) call the helper. Mapping table lives in the function:
```
welcome-email           → intake.welcome_email_sent
contract-invitation     → intake.contract_sent
scope-summary           → intake.scope_summary_sent
kickoff-confirmation    → intake.kickoff_confirmation_sent
```
Resolve `clientId` from the recipient email (same lookup pattern the SureContact webhook uses).

**You'll need to confirm the exact template names** you use for those four emails so I map them correctly. If a template doesn't exist yet (e.g. scope summary), I'll flag it.

### 3. Update `surecontact-webhook`
After logging the event, if `event_type === 'opened'` AND `campaign_name` matches the welcome campaign (configurable string match, e.g. contains "welcome"), flip `intake.welcome_opened` for the resolved client.

### 4. Admin UI signal
On the intake checklist in `ClientDetail.tsx`, items already render their `done` state — no UI change required, the checkmark will just appear in real time when the user reloads or the realtime subscription fires.

Optionally: add a small "Auto-checked from SureContact event at HH:MM" tooltip on hover for items flipped by the system. Low priority — confirm if you want it.

## Questions before I build

1. **Template names**: What are the exact `templateName` values you use (or plan to use) when sending the welcome, contract invite, scope summary, and kickoff confirmation emails through `send-transactional-email`? If any aren't built yet, I'll list them and we can decide whether to scaffold them now or leave the corresponding checklist item as manual until they exist.
2. **Welcome-opened matching**: Should I match the SureContact `opened` event by exact `campaign_name`, by a substring like "welcome", or by `message_id` correlated with the original send log?
3. **Backfill**: For existing clients whose welcome emails already went out before this is wired, do you want me to mark `welcome_email_sent` as done based on `email_send_log` history, or leave existing clients as-is?

Once you answer those, I'll implement in one pass.
