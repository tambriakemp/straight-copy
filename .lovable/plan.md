## Stage 1 — Intake migration into Tasks

Goal: make the **Intake** stage live entirely inside the Tasks tab as a gated epic, with the existing automations (kickoff webhook, build-date scheduling, SureContact sync, portal) untouched. Other stages stay in the Journey tab for now. Journey stays mirrored under the hood until every stage is migrated, then dropped.

### 1. Proposed intake tasks (under one "Intake" epic, gated, order_index 0)

| # | Task | Assignee | Acceptance criteria (auto-tick) | Fields |
|---|------|----------|---------------------------------|--------|
| 1 | Welcome email | auto | sent · opened | — |
| 2 | Scope summary email | auto | sent · opened | — |
| 3 | Portal accessed | client | portal_accessed | — |
| 4 | Contract signed | client | contract_signed | links to contract |
| 5 | Onboarding chat completed | client | onboarding_completed | `url` = onboarding chat link |
| 6 | Required accounts submitted | client | accounts_submitted | — |
| 7 | Contract countersigned | agency | — | — |
| 8 | Intake summary reviewed | agency | — | — |
| 9 | Baseline social audit (if existing accounts) | agency | — | — |
| 10 | Kickoff confirmation email | auto | sent · opened — auto-fired when 1–9 complete | — |
| 11 | Build schedule confirmed | agency | — | `due_date` = build_start_date (editable inline; sets `delivery_date` = +8) |

Auto tasks flip to `complete` when all their criteria are ticked. Manual tasks use the existing 6 statuses.

### 2. Database changes (one migration)

- `project_task_epics`: add `journey_stage_key text`, `locked boolean default false`. Unique `(client_project_id, journey_stage_key)`.
- `project_tasks`: add `journey_item_key text`, `auto_key text` (matches the AC `auto_key` used today in journey_templates).
- `acceptance_criteria` jsonb already exists — extend item shape with optional `auto_key` so triggers know which AC to tick.
- Backfill for every existing `automation_build` project:
  - create the Intake epic
  - create the 11 tasks above, copy `done` state from the matching `journey_nodes.checklist` item into task `status` (`complete` vs `backlog`) and AC `done`
- Helper function `public.sync_intake_from_signals(_client_id)` that recomputes AC + task status from `client_email_tracking`, `client_contracts`, `clients.brand_kit_intake_submitted_at`, `clients.client_account_access`, portal access timestamps, etc.

### 3. Trigger rewrites (intake only)

Replace the intake branch of `auto_complete_journey_node` with task-level logic:

- Trigger on `project_tasks` AFTER UPDATE: if all of `contract_signed` + `onboarding_completed` + `accounts_submitted` flip to complete in the same epic → set `clients.build_start_date = tomorrow`, `delivery_date = +8` (and the inverse on reversal). Existing kickoff-webhook gate stays: when tasks 1–9 are all complete and task 10 is still incomplete and `kickoff_webhook_fired_at IS NULL` → `fire_kickoff_webhook`.
- Trigger on `client_email_tracking`, `client_contracts`, `clients` (account/onboarding fields), `preview_approval_events` → call `sync_intake_from_signals` to tick AC + auto-complete tasks. Same surface area as today's `auto_*` keys, just writing to tasks instead of journey checklist.
- Trigger on `project_tasks` to mirror status back into `journey_nodes.checklist` for the intake node, so `get_portal_client`, `sync-client-to-surecontact`, and the kickoff webhook keep reading their existing source. This mirror gets removed in the final cutover after all stages are migrated.
- Epic gating: when all intake tasks complete → unlock the next epic (`locked = false`); reverse on regression. For stage 1 this just unlocks whatever epic currently sits at `order_index = 1` (Brand Voice, still served by the Journey tab).

### 4. UI changes (Tasks tab only)

- Epics render in `order_index` order with a "Locked — finish *Intake* first" overlay on any epic where `locked = true`. Tasks under a locked epic are read-only.
- Auto/client/agency assignee chips already render — add a small "Auto" badge styling so it's obvious those tick themselves.
- Acceptance criteria rows show a 🔒 lock icon when they have an `auto_key` (admin can't tick them manually; they reflect signal state).
- Inline `due_date` editor on "Build schedule confirmed" writes to `clients.build_start_date` via the existing `BuildSchedulePanel` logic, repackaged as a small on-task editor.
- Onboarding chat link task: the existing `OnboardingChatLinkPanel` becomes a tiny inline "Copy chat link" button on that task (URL is generated the same way).
- Journey tab stays mounted for Brand Voice → Active. No visible change to those stages.

### 5. Rollout

1. Ship the migration + triggers + mirror.
2. Backfill runs once; verify on Cre8 Visions LLC growth build that the Intake epic mirrors the current journey state exactly.
3. Spot-check automations: trigger a contract signature, open a tracked email, complete onboarding — confirm AC ticks and journey_nodes mirror updates.
4. Hide intake from the Journey tab (keep other stages visible) — you confirm it feels right before we start Stage 2.

### Open items I'd resolve during build, not now

- Exact copy/labels per task (defaulting to the table above; easy to edit after backfill).
- Whether "Build schedule confirmed" should be a task vs. a small banner on the Intake epic. Defaulting to a task per your guidance.

Approve and I'll write the migration + UI changes for stage 1 only.
