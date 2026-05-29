
## Goal

Add an **admin-only** "Tasks" tab to every client project that functions as a project task board. Claude Code accesses it via REST + MCP and moves tasks through statuses.

## Statuses (fixed enum)

`backlog` · `ready_for_claude` · `in_progress` · `needs_review` · `blocked` · `complete`

Kanban is the default view; a List view toggle is available.

## Database (migration)

New tables, all admin-only RLS (`is_admin(auth.uid())`) + service role:

**`project_task_epics`** — `id, client_project_id, name, color, order_index, created_at, updated_at`

**`project_tasks`** — fields:
- `id`, `client_project_id`, `parent_task_id` (nullable, self-FK → subtasks)
- `epic_id` (nullable → `project_task_epics`)
- `name`, `description` (markdown)
- `status` (enum above, default `backlog`)
- `priority` (`low|normal|high|urgent`)
- `assignee_admin_id` (nullable → `admin_users.id`)
- `assignee_kind` (`admin|claude|unassigned`) — lets us assign "Claude" without a real user row
- `url` (text), `due_date` (date)
- `tags` (`text[]`)
- `order_index` (for Kanban ordering within a column)
- `created_at`, `updated_at`, `created_by`, `completed_at`

**`project_task_attachments`** — `id, task_id, storage_path, file_name, mime_type, size_bytes, uploaded_by, created_at`

New private storage bucket **`project-task-attachments`** with admin-only RLS on `storage.objects`.

Indexes on `(client_project_id, status, order_index)` and `(parent_task_id)`.

## Edge functions

**`project-tasks`** (admin JWT auth, used by the UI)
- `GET    /tasks?project_id=…` — list with epics, subtasks, attachments (signed URLs)
- `POST   /tasks` — create (task or subtask via `parent_task_id`)
- `PATCH  /tasks/:id` — update any field, including status moves and reordering
- `DELETE /tasks/:id` — cascade subtasks/attachments
- `POST   /tasks/:id/attachments` — multipart upload → bucket
- `DELETE /attachments/:id`
- `GET/POST/PATCH/DELETE /epics` — CRUD epics for a project

**`project-tasks-mcp`** (token auth via existing `api_tokens` table; thin MCP wrapper using `mcp-lite`)
- Tools exposed to Claude Code:
  - `list_projects`, `list_tasks(project_id, status?)`, `get_task(id)`
  - `create_task`, `update_task`, `move_task_status`, `add_comment_to_task` (stored in description append for v1)
  - `list_epics`, `create_epic`
- Reuses the same DB logic as the REST function (shared helpers in `_shared/tasks.ts`).
- Server URL surfaced in the new Admin "API Tokens" page so the user can paste it into Claude Code.

Both functions deploy with `verify_jwt = false` and validate in code (JWT for REST, bearer token hash lookup for MCP).

## Frontend

**New tab** "Tasks" added to:
- `AppDevelopmentView` (app/web/marketing)
- `AutomationBuildView`
- `PreviewDetail` (when linked to a client project)

Tab is **admin-only** by definition (these views already live in `AdminLayout` + `RequireAdmin`), so no extra gating needed. **Not** added to the client portal (`PortalProject.tsx`).

**New components** under `src/components/admin/tasks/`:
- `ProjectTasksPanel.tsx` — top-level: view toggle (Kanban default / List), filters (epic, assignee, tag, priority), "+ New task", "+ Manage epics"
- `TaskBoard.tsx` — Kanban with 6 columns; drag-and-drop via `@dnd-kit/core` (already a peer of existing deps; add if missing) to move tasks across statuses and reorder
- `TaskList.tsx` — table view (sortable columns)
- `TaskCard.tsx` — compact card on the board
- `TaskDetailDrawer.tsx` — full editor (Sheet) with all fields, subtasks panel (inline CRUD, same fields), attachments uploader, epic selector with inline create
- `EpicManagerDialog.tsx` — CRUD epics
- `tasksApi.ts` — typed wrappers around the `project-tasks` edge function

Realtime: subscribe to `project_tasks` and `project_task_epics` filtered by `client_project_id` so Claude's status changes appear live.

Styling uses existing `ProjectTabs` and CRM tokens (`--crm-*`); status columns use the existing accent palette.

## Out of scope (v1)

- Per-task comment threads (Claude's "comments" land as description appends for now)
- Client portal visibility
- Recurring tasks, time tracking, multi-assignee

## Build order

1. Migration (tables, bucket, RLS, GRANTs)
2. `_shared/tasks.ts` helpers + `project-tasks` edge function + API tokens surface for MCP URL
3. `project-tasks-mcp` edge function (mcp-lite)
4. `tasksApi.ts` + `ProjectTasksPanel` + Kanban/List + detail drawer + epic manager
5. Wire "Tasks" tab into the three admin project views
6. Smoke test: create epic → create task with subtask + attachment → drag to "Ready for Claude" → hit MCP endpoint to list and move it
