
# Journey → Kanban Board (epics as cards, status as columns)

Replace the current "tasks board" rendering in the Journey tab with a true 3-column Kanban. Columns are statuses. Cards are epics (= journey stages). Clicking a card opens a detail view that contains everything that lives under that stage today.

All `journey_nodes` data, DB triggers, edge functions, SureContact sync, brand voice generation, kickoff webhook, build-date logic, and the standalone Tasks tab stay exactly as they are.

## Layout

```text
┌── Not Started ────────┐ ┌── In Progress ────────┐ ┌── Complete ───────────┐
│ ┌───────────────────┐ │ │ ┌───────────────────┐ │ │ ┌───────────────────┐ │
│ │ Stage 02          │ │ │ │ Stage 01 · Intake │ │ │ │ (none yet)        │ │
│ │ Brand Voice       │ │ │ │ 3 / 8 tasks done  │ │ │ │                   │ │
│ │ ⛔ locked         │ │ │ │ owners: auto·client│ │ │                     │
│ │ 0 / 5 tasks       │ │ │ └───────────────────┘ │ │ └───────────────────┘ │
│ └───────────────────┘ │ │                       │ │                       │
│ ┌───────────────────┐ │ │                       │ │                       │
│ │ Stage 03 …        │ │ │                       │ │                       │
│ └───────────────────┘ │ │                       │ │                       │
└───────────────────────┘ └───────────────────────┘ └───────────────────────┘
```

### Column rules

- **Not Started** ← `journey_nodes.status` in (`pending`, `not_started`, `blocked`).
- **In Progress** ← `status = 'in_progress'`.
- **Complete** ← `status = 'complete'`.
- Cards are ordered by `order_index` within each column.
- Locked stages (previous stage not complete) still render in their column, dimmed, with a ⛔ "locked" chip — visual only; DB triggers already enforce ordering.

### Epic card (compact)

- Stage number + label (`Stage 02 · Brand Voice`).
- Status pill (matches column color).
- Task counter `done / total` from the checklist.
- Owner chips summarising who has work in this stage: `auto`, `client`, `agency` (derived from checklist item owners).
- Optional started/completed date.
- Clicking the card opens the detail view.

## Epic detail view

A right-side drawer (shadcn `Sheet`) opened from the card click. Contains everything that currently lives inside the expanded stage today — no functional changes, just relocated into the drawer:

1. **Header** — stage number, label, status segmented control (Not Started / In Progress / Complete) writing back to `journey_nodes.status` exactly like today's `JourneyNodeCard`.
2. **Tasks** — the existing `JourneyTaskList` (checklist items grouped/coloured by owner: auto / client / agency, auto-owned items read-only with system-managed tooltip, writes through the same `syncChecklist` path).
3. **Stage tools** — rendered in-place from the existing components, untouched:
   - `intake` → `OnboardingChatLinkPanel` + `EmailTrackingPanel` + `BuildSchedulePanel`
   - `brand_voice` → `BrandVoicePanel`
   - `brand_kit` → `BrandKitPanel`
   - `delivery` → `ClientFieldEditor` for `delivery_video_url`
   - `automation_02` → `ClientFieldEditor` for `build_update_note`
4. **Linked asset** — `asset_label` + `asset_url` inputs (existing handler).
5. **Internal notes** — `notes` textarea (existing handler).

When the drawer is open and the underlying node changes (realtime / save), the drawer reflects the new state.

## Board controls (above the columns)

- Filter by owner: All / Auto / Client / Agency (filters which epic cards appear based on whether they contain tasks for that owner).
- Filter by stage key (optional search box).
- Collapse other columns / expand all (purely visual).

No drag-and-drop between columns. Status changes happen from inside the epic detail view (same writes the current expanded card does). Reason: status is automation-driven and gated server-side; allowing drag would invite invalid transitions.

## File changes

- **Edit** `src/pages/admin/AutomationBuildView.tsx`:
  - Replace the current `JourneyTasksBoard` (vertical epic list) with a new Kanban-style board: 3 columns mapped from `journey_nodes.status`, rendering compact epic cards.
  - Replace `JourneyEpicCard`'s expand-in-place behaviour with a click handler that sets a `selectedNodeId` state. The detail drawer mounts once at the board level.
  - Extract a new `JourneyEpicDrawer` component (in the same file, alongside existing in-file components) that wraps the existing tasks list + stage tools + asset + notes blocks. It reuses `JourneyTaskList`, `BrandVoicePanel`, `BrandKitPanel`, `OnboardingChatLinkPanel`, `EmailTrackingPanel`, `BuildSchedulePanel`, `ClientFieldEditor`, `JourneyAssetAndNotes` as-is.
  - Keep all existing data loading, `updateNode`, save handlers, and subscriptions intact.
- No DB migration. No edge function changes. No changes to `project_tasks`/`project_task_epics`. The previously added `auto/client/agency` enum values stay.

## Out of scope

- No changes to `journey_nodes` schema, triggers, kickoff webhook, brand voice generator, SureContact sync, email tracking, or contract logic.
- No changes to the client-facing portal.
- The standalone Tasks tab is untouched.
- No drag-and-drop between columns.
