
## Overview
Add a public client-facing portal that requires no admin login but validates the `clientId` against the `clients` table. The portal surfaces the client's name/business, identifies the current active journey node, and renders a conversational chat for that node. Brand Kit (Node 03) gets a dedicated Claude-backed Edge Function that captures structured intake, persists it, advances the node, and fires a notification webhook.

Nothing in the existing admin app, onboarding flow, or routes is touched.

---

## 1. Database changes (migration)

Add to `public.clients`:
- `brand_kit_intake jsonb` (nullable) — structured Brand Kit answers
- `brand_kit_intake_submitted_at timestamptz` (nullable) — completion stamp
- `brand_kit_conversation jsonb default '[]'::jsonb` — running chat transcript so the portal can resume

No RLS policy changes required (existing policies already cover service role + admins; portal uses the edge function with service role, so the table itself stays locked down).

A small read-only RPC `get_portal_client(_client_id uuid)` (SECURITY DEFINER, `STABLE`, `SET search_path = public`) returns only the safe fields the portal needs:
- `id, business_name, contact_name, tier, brand_kit_intake_submitted_at`
- the current active node payload (id, key, label, order_index, status)

Granted to `anon` and `authenticated`. This avoids exposing the full `clients` table publicly while still giving the portal the data it needs.

---

## 2. New Edge Function: `brand-kit-intake`

Path: `supabase/functions/brand-kit-intake/index.ts`
Config: `verify_jwt = false` (public portal).

Responsibilities:
1. Accept `{ clientId, action, messages? }`.
2. Validate `clientId` exists in `clients` (404 otherwise).
3. Actions:
   - `resolve` — return client name/business, the active node, and any saved `brand_kit_conversation` so the chat can rehydrate.
   - `chat` — stream a Claude (`claude-sonnet-4-5`) response using the same Anthropic→OpenAI SSE transform pattern used in `onboarding-chat`. System prompt is Brand Kit–specific: collects logo files/refs, color palette direction, typography preferences, visual references/moodboard inspiration, do/don't visual rules, file format needs, and the brand kit deliverable scope. Emits `[[BRAND_KIT_COMPLETE]]` when done.
   - `complete` — accept the final structured JSON extracted by Claude (separate non-stream call using `extractSummaryWithClaude`-style helper), then:
     - Persist `brand_kit_intake` (jsonb) and `brand_kit_intake_submitted_at` on `clients`.
     - Update Node 03 (`journey_nodes` row where `client_id = X` and `key = 'brand_kit'`) `status = 'client_submitted'` (new allowed status — see note below). Stamp `started_at` if missing.
     - Save the final transcript to `brand_kit_conversation`.
     - Fire a notification webhook (POST JSON) to a `BRAND_KIT_NOTIFICATION_WEBHOOK_URL` secret. Failures are logged but do not block the response.
4. Auto-save partial transcripts on each `chat` turn (debounced server-side), mirroring the onboarding pattern.

Note on `client_submitted`: existing UI status type is `"pending" | "in_progress" | "complete"`. We will store `"client_submitted"` in the DB column (free-text) — admins still see the node and we'll render it in the portal as "Submitted — awaiting review". The admin journey UI will continue to treat unknown statuses as non-blocking (no admin code change required for portal MVP; it will simply show as not-yet-complete on the admin side, with a note in the node).

Secret needed: `BRAND_KIT_NOTIFICATION_WEBHOOK_URL` (added via the secrets tool before deploy). `ANTHROPIC_API_KEY` already exists.

---

## 3. New page: `src/pages/Portal.tsx`

Route: `/portal/:clientId` (added to `App.tsx`, above the catch-all, outside any `RequireAdmin` wrapper).

Behavior:
1. On mount, call `brand-kit-intake` with `action: "resolve"`.
2. If client not found → render a clean "Portal link invalid" state.
3. Render header: client business name (serif, large) + contact name + tier badge.
4. Render the **current active node** card — defined as the lowest `order_index` node whose status is not `complete` / `client_submitted`. Show node label, order number (e.g. "03"), and status.
5. Conditional body:
   - If active node `key === 'brand_kit'` and not yet submitted → render the chat UI (reusing the styling language of the onboarding chat: streaming bubbles, textarea with Send icon, stage indicator). Calls `brand-kit-intake` for streaming.
   - On `[[BRAND_KIT_COMPLETE]]` → show "Review & Submit" button which fires the `complete` action.
   - On success → show a confirmation screen ("Thank you — your Brand Kit intake is in our hands"), with the same dark editorial styling.
   - If active node is not Brand Kit → render a polite placeholder ("Your team is working on the next step. We'll email you when it's ready for your input.") so the portal is future-proof for other nodes.
6. If `brand_kit_intake_submitted_at` is already set → show the confirmation screen directly (idempotent).

State persistence: localStorage cache `cre8-portal-${clientId}` for instant rehydrate, mirroring `Onboarding.tsx`.

---

## 4. Styling

Reuse the existing `.crm-shell` dark editorial scope from `src/index.css` (cream/stone/ink/taupe + Cormorant Garamond + Karla, 11px uppercase 0.35em tracking subheads, etc.). The Portal page will mount inside a `<div className="crm-shell">` wrapper but **without** the admin top nav — instead a slim portal header with the CRE8 wordmark, the client's business name, and the journey progress chip ("Step 03 of 10 · Brand Kit").

New scoped classes in `src/index.css` under `.crm-shell` (no global leakage):
- `.portal-shell`, `.portal-hero`, `.portal-node-card`, `.portal-chat`, `.portal-bubble--user`, `.portal-bubble--assistant`, `.portal-confirm`.

Matches the same min-height:0 / overflow-y:auto pattern we already use in the modal so chat scrolls correctly within a fixed viewport.

---

## 5. Files touched

- **New:** `supabase/functions/brand-kit-intake/index.ts`
- **New:** `src/pages/Portal.tsx`
- **Edit:** `src/App.tsx` — add `<Route path="/portal/:clientId" element={<Portal />} />` above catch-all
- **Edit:** `src/index.css` — append `.portal-*` classes inside the `.crm-shell` scope
- **Edit:** `supabase/config.toml` — add `[functions.brand-kit-intake]` with `verify_jwt = false`
- **Migration:** add the three `clients` columns + `get_portal_client` RPC

No edits to: existing admin pages, `RequireAdmin`, navbar, onboarding chat, or any user-facing marketing pages.

---

## 6. Open question (will use defaults if not answered)

**Webhook destination** — I'll request a `BRAND_KIT_NOTIFICATION_WEBHOOK_URL` secret via the secrets tool right before the function deploys. If you'd rather route this through your existing `notify.cre8visions.com` transactional email pipeline (sending an internal email to `hello@cre8visions.com` instead of an external webhook), I can swap the webhook for a `send-transactional-email` invocation — say the word and I'll adjust before building.

Approve to proceed and I'll switch into build mode.
