# Fix Node 1 status & reset bad checklist data

## Problem
Node 1 (Intake) is showing complete even though system-managed items aren't actually finished. The previous "all checkboxes toggle together" bug caused auto/client items to get marked done in the database. We need to (a) reset that bad data and (b) prevent it from happening again.

## Changes

### 1. Migration — add safeguard trigger
Create `auto_reopen_journey_node` trigger on `journey_nodes` that runs on UPDATE of `checklist`:
- If a node is `complete` but not all items are `done`, flip status back to `in_progress` and clear `completed_at`.
- When a node reopens, reset any later nodes (higher `order_index`) that are `in_progress` or `complete` back to `pending` so the flow stays consistent.

### 2. Data cleanup (same migration)
For every `journey_nodes` row across all clients:
- Walk `checklist` and force `done = false` for any item where `owner` is `auto` or `client`, plus `intake.contract_countersigned` (which is system-stamped on agency countersign).
- After the reset, recompute status: any node previously `complete` whose items are no longer all done becomes `in_progress` (and downstream nodes go back to `pending`).

Agency-owned items keep whatever the admin actually checked. The two manual agency items in Intake remain user-controlled.

### 3. No frontend changes needed
The UI already (after the prior fix) blocks admins from toggling auto/client/contract_countersigned items. The trigger plus existing `auto_complete_journey_node` will keep status in sync going forward — the system will auto-complete a node only when truly all items (including the system-managed ones, once their real events fire) are done.

## Technical notes
- New trigger is `BEFORE UPDATE OF checklist` so it adjusts `status`/`completed_at` in the same row write, then a follow-up `UPDATE` cascades downstream nodes.
- Migration is idempotent: safe to re-run.
- After migration, Node 1 for the current client will correctly show `in_progress` with the system items unchecked.