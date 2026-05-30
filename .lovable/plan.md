# Journey → Tasks Board Layout

Render the existing journey stages and their checklist items in the same Tasks-board visual language already used on the Tasks tab, **without changing the underlying `journey_nodes` data model or any of the automation triggers, edge functions, or sync logic that depend on it**.

## What stays exactly the same

- `journey_nodes` table, `journey_templates`, all checklist JSONB contents, all special client fields (`brand_voice_*`, `brand_kit_intake`, `build_start_date`, `delivery_video_url`, `build_update_note`, etc.).
- DB triggers: `auto_complete_journey_node` (auto-advance + kickoff webhook + build date logic), `cascade_reset_downstream_nodes`, `seed_journey_nodes_for_client`, `sync_journey_nodes_on_tier_change`, `fire_surecontact_sync`, `auto_reopen_journey_node`, `stamp_journey_node_status`.
- Edge functions, SureContact sync, brand voice generation, email tracking, build schedule logic.
- The separate Tasks tab (real `project_tasks`) keeps working for ad-hoc work.

## Schema change (one migration)

Extend the `project_task_assignee_kind` enum so ad-hoc tasks can optionally use the new labels too:

```sql
ALTER TYPE project_task_assignee_kind ADD VALUE IF NOT EXISTS 'auto';
ALTER TYPE project_task_assignee_kind ADD VALUE IF NOT EXISTS 'client';
ALTER TYPE project_task_assignee_kind ADD VALUE IF NOT EXISTS 'agency';
```

Existing `unassigned / admin / claude` values are preserved. No data migration required. No new tables — journey data stays in `journey_nodes`.

## New component: `JourneyTasksBoard`

Replaces the current vertical stack of `JourneyNodeCard`s in `AutomationBuildView.tsx`. Reuses the visual primitives from `ProjectTasksPanel` (column/card styling, badges, status pills, owner chips) but is backed by `journey_nodes`, not `project_tasks`.

Layout (same dark editorial theme as the Tasks board):

```text
┌─ Stage 01 · Intake ─────────── ● In Progress ── 3 / 8 ──┐
│  [auto] Welcome email sent              ✓               │
│  [auto] Kickoff confirmation sent       ✓               │
│  [client] Contract signed               ☐               │
│  [client] Onboarding chat completed     ✓               │
│  [agency] Contract countersigned        ☐               │
│  ─────────────────────────────────────────────────      │
│  ▾ Stage tools                                          │
│    • Onboarding chat link panel                         │
│    • Email tracking panel                               │
│    • Build schedule panel                               │
└─────────────────────────────────────────────────────────┘
┌─ Stage 02 · Brand Voice ─ ⛔ locked until Stage 01 done ┐
│  …                                                      │
└─────────────────────────────────────────────────────────┘
```

### Per epic (= journey stage)

- Header: `Stage NN · {label}`, status pill driven by `node.status`, completion counter, started/completed dates.
- Locked state when the previous node isn't `complete` — header dimmed, checkboxes disabled, "Locked until previous stage completes" hint. (Visual only — DB triggers already enforce ordering.)
- Expandable. Inside: list of checklist items, then a "Stage tools" sub-section.
- Status segmented control (Not Started / In Progress / Blocked / Complete) — same writes to `journey_nodes.status` as today.

### Per task (= checklist item)

- Card-like row with checkbox, label, and an owner chip rendered with the existing task-board palette:
  - `auto` → muted/system color
  - `client` → bronze/accent
  - `agency` → warm-white outlined
- Toggling the checkbox writes back to `journey_nodes.checklist` exactly the same way `NodeChecklist` does today (preserves `auto_key`, runs through `syncChecklist`).
- `auto`-owned items remain read-only with a "system-managed" tooltip (matching current behavior).

### Stage tools (inside expanded epic)

Render the existing special panels in-place, unchanged code:
- `intake` → `OnboardingChatLinkPanel` + `EmailTrackingPanel` + `BuildSchedulePanel`
- `brand_voice` → `BrandVoicePanel`
- `brand_kit` → `BrandKitPanel`
- `delivery` → `ClientFieldEditor` for `delivery_video_url`
- `automation_02` → `ClientFieldEditor` for `build_update_note`
- All stages: Linked Asset (asset_label + asset_url) and Internal Notes inputs, same handlers.

Result: no new fields need to be added to `journey_nodes` — every special input already has a column.

## Filter / view controls

Above the stages, mirroring the Tasks board toolbar:
- Filter by owner: All / Auto / Client / Agency.
- Filter by status: All / Not Started / In Progress / Complete.
- Collapse all / Expand all.

(No drag-and-drop reordering — stages are template-driven; checklist items are stage-bound. Keeps automation invariants intact.)

## File changes

- **New** `src/components/admin/journey/JourneyTasksBoard.tsx` — the new board view.
- **New** `src/components/admin/journey/JourneyEpicCard.tsx` — one stage rendered as an epic card.
- **New** `src/components/admin/journey/JourneyTaskRow.tsx` — one checklist item rendered as a task row.
- **Move** existing panel components (`BrandVoicePanel`, `BrandKitPanel`, `OnboardingChatLinkPanel`, `EmailTrackingPanel`, `BuildSchedulePanel`, `ClientFieldEditor`, `NodeChecklist`) out of `AutomationBuildView.tsx` into `src/components/admin/journey/panels/` so the new board can import them. No behavior changes.
- **Edit** `src/pages/admin/AutomationBuildView.tsx` — replace the `{nodes.map((n) => <JourneyNodeCard …/>)}` block in the Journey tab with `<JourneyTasksBoard client={client} nodes={nodes} onUpdate={…} onReload={reload} />`. Keep all data-loading, save handlers, and subscriptions intact.
- **Migration** to extend the `project_task_assignee_kind` enum (above).

## Out of scope (explicitly)

- No changes to `project_tasks` / `project_task_epics` rows for journey data.
- No changes to edge functions, SureContact sync, kickoff webhook, brand voice generator, contract logic.
- No changes to the client-facing portal.
- The standalone Tasks tab is untouched.
