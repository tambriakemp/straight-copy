## Weekly Project Progress Report

AI-generated weekly progress report sent every Friday at 5pm ET (21:00 UTC) to the project's selected contacts plus admin, summarizing completed tasks. Delivered via SureContact so opens/clicks are tracked.

### 1. Database

New columns on `client_projects`:
- `progress_report_enabled` (bool, default `true`)
- `progress_report_recipient_ids` (uuid[], default `{}`) — references `client_contacts.id`. Empty = fall back to project primary contact.
- `progress_report_last_sent_at` (timestamptz, nullable)

New table `project_progress_reports` (audit log): `client_project_id`, `period_start`, `period_end`, `summary_markdown`, `summary_html`, `task_ids` (uuid[]), `recipients` (text[]), `sent_at`, `error`. Admins + service_role policies, standard GRANTs.

### 2. Project Settings tab

Add a **Settings** tab (last position) to `AppDevelopmentView` (web/app/marketing) and `AutomationBuildView`. Final tab order: Client Tasks, Proposals, Payment Schedule, Preview, [Social if marketing], Settings.

New `src/components/admin/ProjectSettingsPanel.tsx`:
- **Weekly Progress Report** card
  - Toggle enabled (default on)
  - Multi-select checkbox list of the client's `client_contacts` (name + email + role). Project primary contact pre-checked.
  - Info note: admin always receives a copy.
  - "Send report now" button (admin utility — runs the generator immediately for this week).
  - Shows `progress_report_last_sent_at`.

### 3. SureContact email template

SureContact templates are pre-built with merge tags. You'll need to create one template in SureContact (similar to the existing web-dev templates in `web-dev-emails.ts`) with these merge fields:
- `{{project_name}}`, `{{business_name}}`, `{{contact_name}}`, `{{period_label}}`, `{{report_html}}` (the AI-generated body, branded HTML), `{{portal_url}}`.

I'll add the template binding to a new shared file `supabase/functions/_shared/progress-report-email.ts` with a constant for the template UUID. **You'll need to give me the SureContact template UUID** once it's created (or I can stub it and you paste it in). The send path uses `upsertSureContact` (refreshes merge fields) then POSTs to `https://api.surecontact.com/api/v1/public/emails/send` with `template_uuid` — same pattern as `sendWebDevTemplate`. SureContact tracks opens/clicks natively.

### 4. Edge function: `generate-progress-report`

Inputs: `{ projectId, forceSend?: boolean }`.

Flow:
1. Load project, client, primary contact, and selected recipient contacts (fall back to primary if list empty).
2. Skip if `progress_report_enabled = false` (unless `forceSend`).
3. Query `project_tasks` completed this week (status = `completed` AND `updated_at` between last Friday 21:00 UTC and this Friday 21:00 UTC), cross-checked against `project_task_activity` rows of kind `status_changed`.
4. If zero completed tasks → insert `project_progress_reports` row with `error = 'no_tasks_completed'`, return without sending.
5. Call Lovable AI Gateway (`google/gemini-2.5-flash`) with task names, descriptions, epic names, completion dates. Prompt produces ClickUp-style output: "Project Overview" paragraph + "Key Decisions and Updates" bullets (max 5, ✅ prefix, bold lead-in). Render to brand-styled HTML (cream/stone/ink/taupe, Cormorant heading, Karla body).
6. For each recipient (selected contacts + admin email), call `upsertSureContact` then POST to SureContact `/emails/send` with the progress-report template UUID, passing `report_html` and the other merge fields. Admin address: `tambria@cre8visions.com` (configurable via env var `PROGRESS_REPORT_ADMIN_EMAIL`).
7. Insert `project_progress_reports` row, update `progress_report_last_sent_at`.

### 5. Cron dispatcher: `dispatch-weekly-progress-reports`

Iterates active `client_projects` with `progress_report_enabled = true` and calls `generate-progress-report` for each.

Scheduled with `pg_cron` + `pg_net` at `0 21 * * 5` (Friday 21:00 UTC = 5pm EDT / 4pm EST). Note: ET shifts with DST; 21:00 UTC year-round means 5pm ET only during DST. I'll confirm that's acceptable, otherwise switch to 22:00 UTC in winter (would need conditional logic at runtime).

Add `[functions.generate-progress-report]` and `[functions.dispatch-weekly-progress-reports]` with `verify_jwt = false` to `supabase/config.toml`.

### 6. Files

**New**
- `supabase/migrations/<ts>_project_progress_reports.sql`
- `src/components/admin/ProjectSettingsPanel.tsx`
- `supabase/functions/generate-progress-report/index.ts`
- `supabase/functions/dispatch-weekly-progress-reports/index.ts`
- `supabase/functions/_shared/progress-report-email.ts`

**Edited**
- `src/pages/admin/AppDevelopmentView.tsx` (add Settings tab)
- `src/pages/admin/AutomationBuildView.tsx` (add Settings tab)
- `supabase/config.toml`
- `src/integrations/supabase/types.ts` (auto-regen after migration)

### Open items before build

1. **SureContact template UUID** — you'll create the template in SureContact with merge fields `{{project_name}} {{business_name}} {{contact_name}} {{period_label}} {{report_html}} {{portal_url}}`, then give me the UUID. I'll stub it as `PROGRESS_REPORT_TEMPLATE_UUID` if not ready.
2. **Admin email** — defaulting to `tambria@cre8visions.com`. Confirm or I'll add `PROGRESS_REPORT_ADMIN_EMAIL` env var.
3. **DST behavior** — OK to use 21:00 UTC year-round (5pm EDT / 4pm EST)?
