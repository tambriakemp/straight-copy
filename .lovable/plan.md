

## Plan: Client Pipeline CRM with REST API

A protected `/admin` area for tracking onboarding clients through delivery, plus a token-authenticated REST API so external automation tools (Zapier, Make, n8n, custom scripts) can read and update pipeline data.

### 1. Database (new tables via migration)

**`clients`** — one row per client in pipeline
- `id` (uuid), `created_at`, `updated_at`
- `business_name`, `contact_name`, `contact_email`, `contact_phone`
- `tier` (text: `launch` | `growth`)
- `stage` (text enum: `intake_submitted`, `brand_voice_generation`, `build_in_progress`, `ready_for_review`, `delivered`, `active_client`)
- `stage_order` (int — for manual reordering inside a column)
- `intake_summary` (text — editable summary, auto-seeded from onboarding submission)
- `brand_voice_url` (text — link to doc)
- `brand_voice_content` (text — optional inline content)
- `onboarding_submission_id` (uuid, nullable — links to existing `onboarding_submissions`)
- `notes` (text)

**`client_checklist_items`** — build checklist
- `id`, `client_id` (fk), `label`, `completed` (bool), `order_index`, `created_at`

**`client_automations`** — automation status indicators
- `id`, `client_id` (fk), `name`, `status` (`not_started` | `building` | `live` | `paused`), `notes`, `updated_at`

**`client_deliveries`** — monthly delivery log
- `id`, `client_id` (fk), `delivery_date`, `title`, `description`, `link_url`, `created_at`

**`api_tokens`** — for REST API auth
- `id`, `token_hash` (text — sha256 of bearer token), `label`, `created_at`, `last_used_at`, `revoked` (bool)

**`admin_users`** — who can access `/admin`
- `id`, `user_id` (uuid, references auth.users), `created_at`

**RLS:** All tables enable RLS. `clients`, checklist, automations, deliveries — readable/writable by users in `admin_users` (via `is_admin()` security-definer function). API tokens — service role only. Edge functions use service role to bypass RLS for the public API.

**Trigger:** auto-create a `clients` row when an `onboarding_submissions` row is marked `completed=true` (seeds business name, contact info, intake summary from `summary` JSON, default stage `intake_submitted`).

### 2. Authentication

- Enable email/password auth (auto-confirm ON for admin convenience).
- New `/admin/login` page — email + password.
- A user becomes admin only after their `auth.users.id` is added to `admin_users` (manually seeded for first user via migration using your email — you'll provide it, or we'll add it via the SQL editor after first signup).
- Route guard: `<RequireAdmin>` wrapper redirects non-admins to `/admin/login`.

### 3. Admin UI (new pages, isolated from marketing site)

Clean minimal design — neutral grays/white, system font stack inside admin (keeps it visually distinct from the editorial marketing site, also faster to scan). Uses existing shadcn components.

**`/admin` — Kanban dashboard**
- 6 columns (one per stage), horizontally scrollable on small screens.
- Each card: business name (bold), contact name, tier badge (Launch=stone / Growth=accent), submitted date (relative), brand voice doc link icon (if set).
- Drag-and-drop between columns to change stage (`@dnd-kit/core` — already React-friendly, lightweight).
- Top bar: search input, tier filter, "+ New Client" button, link to API tokens page.

**`/admin/clients/:id` — detail page**
Tabbed layout:
- **Overview**: contact info (editable inline), tier, stage selector, submitted date, intake summary (textarea), brand voice URL + optional content textarea, notes.
- **Checklist**: list of checkbox items, add/remove/reorder, defaults seeded based on tier (Launch gets ~6 items, Growth gets ~12).
- **Automations**: rows with name + status pill (color-coded), add/edit.
- **Deliveries**: monthly log table, "+ Log Delivery" form (date, title, description, link).
- **Danger**: archive button.

**`/admin/tokens` — API token management**
- List existing tokens (label, created, last used, revoke button).
- "Generate token" — shows raw token ONCE, stores only sha256 hash.

### 4. REST API (edge function: `crm-api`)

Single edge function routing by path/method, `verify_jwt = false`, auth via `Authorization: Bearer <token>` header validated against `api_tokens.token_hash`.

Endpoints:
```
GET    /clients                  list (filters: stage, tier, search)
POST   /clients                  create
GET    /clients/:id              full detail (incl. checklist, automations, deliveries)
PATCH  /clients/:id              update fields (incl. stage)
POST   /clients/:id/checklist    add checklist item
PATCH  /checklist/:id            toggle/edit item
POST   /clients/:id/automations  add automation
PATCH  /automations/:id          update status
POST   /clients/:id/deliveries   log delivery
POST   /clients/:id/documents    save brand voice (url + optional content)
```

All responses JSON. Validation with Zod. Returns `401` on bad token, `404` on missing resource, `400` on validation errors. Updates `last_used_at` on every authenticated call.

### 5. Files to create/edit

**New:**
- Migration: tables + RLS + `is_admin()` function + onboarding→client trigger
- `src/pages/admin/AdminLogin.tsx`
- `src/pages/admin/Dashboard.tsx` (Kanban)
- `src/pages/admin/ClientDetail.tsx`
- `src/pages/admin/Tokens.tsx`
- `src/components/admin/RequireAdmin.tsx`
- `src/components/admin/AdminLayout.tsx` (sidebar nav)
- `src/components/admin/ClientCard.tsx`
- `src/components/admin/KanbanColumn.tsx`
- `src/components/admin/StageBadge.tsx`, `TierBadge.tsx`
- `supabase/functions/crm-api/index.ts` + `deno.json`
- `src/hooks/useAdminAuth.ts`

**Edited:**
- `src/App.tsx` — add `/admin/*` routes
- `supabase/config.toml` — add `[functions.crm-api]` block with `verify_jwt = false`

**Dependencies to add:** `@dnd-kit/core`, `@dnd-kit/sortable`, `zod` (likely already present), `date-fns` (already present in shadcn).

### 6. Out of scope (ask if you want these added)
- File uploads for brand voice docs (currently URL-only — can add Supabase Storage bucket if you want true file hosting)
- Email notifications when clients move stages
- Multi-admin roles (everyone in `admin_users` has full access)
- Public-facing client portal

### Notes for the user (non-technical)
- After this ships, you'll sign up at `/admin/login`, then I'll add your account to the admin list with one SQL line (or we can hardcode your email upfront — let me know).
- The REST API uses bearer tokens you generate from the admin UI. Treat tokens like passwords — they're shown once.
- New onboarding submissions automatically appear in the "Intake Submitted" column.

