## Goal

For every Web Development project, automatically seed the full 51-task backlog organized into 7 epics, with correct assignees, descriptions, instructions, acceptance criteria, and (where applicable) a linked SureContact email template. Wire all 8 templates so agency-triggered emails are buttons on the matching tasks, and auto-triggered emails fire from server-side events. Also add a manual "Seed Web Dev tasks" button so the project the user is currently viewing (and any past ones) can be backfilled.

## Source of truth

A new code module: `supabase/functions/_shared/web-dev-tasks.ts`

Exports a typed structure:

```ts
export const WEB_DEV_EPICS = [
  { key: 'intake',     name: 'Phase 01 — Intake & Kickoff',        order: 1 },
  { key: 'discovery',  name: 'Phase 02 — Discovery & Planning',    order: 2 },
  { key: 'design',     name: 'Phase 03 — Design',                  order: 3 },
  { key: 'dev',        name: 'Phase 04 — Development',             order: 4 },
  { key: 'qa',         name: 'Phase 05 — QA & Pre-Launch',         order: 5 },
  { key: 'launch',     name: 'Phase 06 — Launch',                  order: 6 },
  { key: 'handoff',    name: 'Phase 07 — Handoff & Closure',       order: 7 },
];

export const WEB_DEV_TASKS = [
  { epic: 'intake', num: '1.1', name: '...', assignee_kind: 'auto',
    description: '...', instructions: [...], acceptance_criteria: [...],
    email: { uuid: 'aa81debf...', trigger: 'auto' | 'agency',
             template_key: 'web-dev-kickoff' } },
  // ...51 entries total
];
```

The 51 task definitions come straight from the attached workflow doc. Owner maps to `assignee_kind`:

- "System"/"Auto" → `auto`
- "Agency"/agency-led → `admin`
- "Client" → `client`
- mixed (e.g. "Agency sends, Client submits") → `admin` (primary actor) with note in description

Instructions list is folded into the task description (markdown bullets) since `project_tasks` has no separate instructions field. `acceptance_criteria` maps directly to the existing JSON column.

## Seeding logic

New helper `supabase/functions/_shared/web-dev-tasks.ts → seedWebDevTasks(sb, projectId)`:

1. Idempotency: bail if the project already has an epic with `journey_stage_key = 'web_dev:intake'`. Lets the function be called safely from both webhook and admin button.
2. Insert all 7 epics into `project_task_epics` with `journey_stage_key = 'web_dev:<key>'`, `locked = true`, ordered.
3. Insert 51 tasks into `project_tasks` with correct `epic_id`, `assignee_kind`, `status='backlog'`, `order_index` matching doc order, `acceptance_criteria`, and (for tasks with an email) store the template UUID + trigger in a new `metadata` field — see schema change below.

### Schema change (migration)

`project_tasks` currently has no place for the SureContact template binding. Add one column:

```sql
ALTER TABLE public.project_tasks ADD COLUMN email_template jsonb;
-- shape: { "template_uuid": "...", "trigger": "agency" | "auto",
--          "template_key": "web-dev-kickoff", "sent_at": "...", "last_send_error": null }
```

No GRANT changes needed (table already exposed). No new table required.

## Webhook integration

In `supabase/functions/surecart-webhook/index.ts`, after successful `client_projects.insert(...)` in the Web Dev branch (line ~400), call `seedWebDevTasks(supabase, newProject.id)`. Errors are logged but do not fail the webhook (project still useful without tasks; admin can re-seed via button).

## Admin "Seed Web Dev tasks" button

- Add a route in the existing admin tasks API (`supabase/functions/project-tasks/index.ts`): `POST /seed-web-dev` with `{ project_id }`. Validates the project is `type='web_development'`, calls `seedWebDevTasks`, returns count of created tasks/epics.
- In `src/components/admin/tasks/ProjectTasksPanel.tsx`, show a "Seed Web Dev tasks" button in the header when `project.type === 'web_development'` AND the project currently has zero tasks. Clicking calls the new endpoint, then refetches.

## Email wiring (all 8 templates)

Add `supabase/functions/_shared/web-dev-emails.ts`:

```ts
export const WEB_DEV_EMAIL_TEMPLATES = {
  'web-dev-kickoff':                { uuid: 'aa81debf...', trigger: 'agency' },
  'web-dev-contract-signed':        { uuid: '375741e8...', trigger: 'auto' },
  'web-dev-questionnaire-complete': { uuid: 'ccd63937...', trigger: 'auto' },
  'web-dev-design-concepts-ready':  { uuid: '4d87b58a...', trigger: 'agency' },
  'web-dev-design-approved':        { uuid: '08c4a5e9...', trigger: 'agency' },
  'web-dev-prelaunch-preview':      { uuid: 'd2283bd3...', trigger: 'agency' },
  'web-dev-launch-confirmation':    { uuid: '5b4efb27...', trigger: 'agency' },
  'web-dev-postlaunch-followup':    { uuid: '745635fc...', trigger: 'auto-3d-after-launch' },
};
```

New shared function `sendWebDevTemplate(sb, { taskId, templateKey, clientId, extraMergeFields })`:

1. Looks up the primary client contact (email/name/phone/business_name).
2. Builds `customFields` (SureContact merge fields): `portal_url`, `project_name`, `project_url`, `contract_link`, `loom_url`, plus any `extraMergeFields` the specific template needs (e.g. launch summary, design preview URL).
3. Calls existing `upsertSureContact()` to refresh merge data.
4. POSTs to `https://api.surecontact.com/api/v1/public/emails/send` with `{ contact_email, template_uuid }` — same pattern as `send-preview-review-email`.
5. On success, updates the task's `email_template.sent_at`; on failure stores `last_send_error`.

### New edge function `send-web-dev-email`

Thin wrapper around `sendWebDevTemplate`. Admin-auth (same `requireAdmin` pattern as `project-tasks/index.ts`). Body: `{ task_id, extra_merge_fields? }`. Reads task to get `email_template.template_uuid` + `client_project_id` → resolves client.

### UI: per-task "Send email" button

In `ProjectTasksPanel.tsx` task card, when `task.email_template?.template_uuid` exists AND `email_template.trigger === 'agency'`:

- Show a small button: "Send: <template-key>". Disabled while sending. Shows `sent_at` timestamp once sent (toast confirms; allow resend).
- For `trigger === 'auto'`, show a passive badge "Auto-fires on …" instead of a button.

### Auto-fire wiring

Three auto-trigger events to hook:

| Template                          | Trigger event                                                              |
|----------------------------------|----------------------------------------------------------------------------|
| `web-dev-contract-signed`        | After `client_contracts` insert (existing `contract-sign` edge function)   |
| `web-dev-questionnaire-complete` | After onboarding submission completes for a web_dev project                |
| `web-dev-postlaunch-followup`    | 3 days after launch — added to existing `process-email-queue` cron pattern |

For the post-launch one: when the "Site published to live domain" task (4-or-6) gets marked complete, enqueue a delayed send (use a new `web_dev_scheduled_emails` table with `send_after`, processed by an existing or new cron).

## Files touched

- `supabase/migrations/<ts>_web_dev_tasks.sql` — add `email_template jsonb` column to `project_tasks`; add `web_dev_scheduled_emails` table + GRANTs/RLS.
- `supabase/functions/_shared/web-dev-tasks.ts` (new) — definitions + `seedWebDevTasks`.
- `supabase/functions/_shared/web-dev-emails.ts` (new) — template registry + `sendWebDevTemplate`.
- `supabase/functions/surecart-webhook/index.ts` — call `seedWebDevTasks` after web_dev project insert.
- `supabase/functions/project-tasks/index.ts` — add `POST /seed-web-dev` route.
- `supabase/functions/send-web-dev-email/index.ts` (new) — admin endpoint for manual sends.
- `supabase/functions/contract-sign/index.ts` — if contract is for a web_dev project, fire `web-dev-contract-signed`.
- `supabase/functions/save-onboarding/index.ts` — if submission is tied to a web_dev project, fire `web-dev-questionnaire-complete`.
- `supabase/functions/process-email-queue/index.ts` (or new `dispatch-web-dev-scheduled` cron) — drain `web_dev_scheduled_emails`.
- `src/components/admin/tasks/ProjectTasksPanel.tsx` — Seed button + per-task email button + auto-fire badge.

## Out of scope (for this pass)

- Editing the SureContact templates themselves (UUIDs are referenced only).
- Per-page subtasks under Development (4.6 stays a single task; users can add subtasks later).
- Reordering or renaming tasks after they're seeded — admins can edit normally.
