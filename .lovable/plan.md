

## Plan: Invite Links + Resumable Onboarding Sessions

Two related upgrades to the onboarding experience:

1. **Unique invite links** — admins generate a personal link per prospect (e.g. `/onboarding?invite=abc123`). Opening it pre-loads their name/email and ties the conversation to that invite.
2. **Auto-saving, resumable chat** — every message is persisted as it happens. If the client closes the tab and comes back via the same link (or device), they pick up exactly where they left off, with full scrollable history.

### 1. Database changes (one migration)

**New table: `onboarding_invites`**
- `id` uuid pk
- `token` text unique (random URL-safe slug — what goes in the link)
- `contact_name`, `contact_email`, `business_name` (optional pre-fill)
- `note` (admin-only context, e.g. "lead from Instagram DM")
- `expires_at` timestamptz nullable
- `created_by` uuid (admin user id)
- `created_at`, `last_opened_at`, `completed_at`
- `submission_id` uuid nullable — links to the row in `onboarding_submissions` once started

**Modify `onboarding_submissions`**
- Add `invite_id` uuid nullable (FK-like reference — soft, no hard FK)
- Add `last_activity_at` timestamptz (so we can show "in progress" sessions)
- `completed` already exists; we'll insert the row early (with `completed=false`) and update it as the chat progresses, instead of only inserting at the end.

**RLS**
- `onboarding_invites`: admins manage (via `is_admin()`), service role full access. Public read of a SINGLE invite by token happens through an edge function — the table itself stays admin-only.
- `onboarding_submissions`: keep current rules; the edge functions use the service role to read/update by invite token.

**Trigger update**
- Existing `create_client_from_onboarding` trigger still fires when a submission is marked `completed=true`. No change needed.

### 2. Edge functions (new + updated)

**New: `onboarding-session`** (`verify_jwt = false`, public)
- `POST { action: "resolve", token }` → returns invite metadata (name/email/business) + any in-progress conversation. Updates `last_opened_at`. 404 if token missing/expired.
- `POST { action: "save", token, conversation, stage }` → upserts the submission row tied to the invite, stores the running conversation array and current stage, bumps `last_activity_at`. Throttled client-side to ~1 call per 2 seconds.
- `POST { action: "complete", token, conversation }` → marks complete (reuses existing summary/email logic from `save-onboarding`).

**Updated: `save-onboarding`**
- Stays for the no-invite (anonymous) flow, but factored to share the summary+email helper with `onboarding-session`.

**No change**: `onboarding-chat` (streaming) stays as-is.

### 3. Admin UI (new)

**`/admin/invites`** — new page in admin nav
- Table of invites: contact, email, business, status (pill: Not opened / In progress / Completed / Expired), created date, last opened, copy-link button, revoke button.
- "+ New Invite" dialog: name, email, business, optional expiry (7/30/never), optional note → returns the full URL, auto-copies to clipboard, shows toast.
- Status is computed: `completed_at` set → Completed; `submission_id` set + `last_activity_at` recent → In progress; `last_opened_at` set → Opened; else Not opened. `expires_at` < now → Expired.

**Dashboard tweak**
- Small "Invites" button in the topbar next to "+ New Client" that links to `/admin/invites`.

### 4. Onboarding page changes (`src/pages/Onboarding.tsx`)

- On mount, read `?invite=` from URL.
  - If present: call `onboarding-session` with `action: "resolve"`. If it returns saved messages → skip the welcome screen, hydrate `messages`, `stage`, scroll to bottom. If it's a fresh invite → show welcome with "Welcome, {name} — ready when you are."
  - If absent: current anonymous flow (unchanged).
- After every assistant turn finishes streaming AND after every user send, call `onboarding-session` `action: "save"` with the latest conversation + stage. Debounced (max once per 1.5s, plus a final flush on completion).
- Use `localStorage` as a fallback cache (`cre8-onboarding-{token}`) so the chat hydrates instantly while the network resolve loads, and so a momentary save failure doesn't lose state.
- Existing scroll container already exists (`.ob-scroll`). Add an explicit `max-h` and ensure history scrolls naturally — currently it auto-scrolls to bottom on every new message; we'll keep that for new messages but NOT force-scroll when hydrating an existing session (so the user lands at the bottom but can scroll up freely).
- On `[[ONBOARDING_COMPLETE]]`, call `action: "complete"` instead of the old `save-onboarding` when an invite is present.

### 5. Files to create / edit

**New**
- `supabase/functions/onboarding-session/index.ts` + `deno.json`
- `src/pages/admin/Invites.tsx`
- Migration: `onboarding_invites` table + `invite_id`/`last_activity_at` columns on `onboarding_submissions` + RLS

**Edited**
- `src/pages/Onboarding.tsx` — invite resolution, debounced auto-save, hydration
- `src/pages/admin/Dashboard.tsx` — "Invites" button in topbar
- `src/components/admin/AdminLayout.tsx` — "Invites" nav item
- `src/App.tsx` — add `/admin/invites` route under `<RequireAdmin>`
- `supabase/functions/save-onboarding/index.ts` — keep as-is, no breaking changes

### Out of scope (ask if wanted)
- Email delivery of the invite link from the admin panel (currently: copy link, paste into your own email/text). Easy to add later via the existing transactional email system.
- Per-client analytics (time to complete, drop-off stage).
- "Resume from another device" via emailed magic link (current model: anyone with the link can resume — same as Calendly/Typform invites).

### Notes for the user
- The link is the credential. Anyone with it can view/edit that session — same model as a Google Doc share link. Set an expiry date for sensitive invites.
- Auto-save runs every couple of seconds while the conversation is active. Closing the tab and reopening the same link restores everything.
- Existing `/onboarding` (no invite) keeps working unchanged for walk-ins.

