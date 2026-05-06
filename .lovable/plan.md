# Clients → Projects restructure

Today, "Previews" lives at the top nav and the giant journey/onboarding/contract/brand-voice flow lives directly on the client. We will reframe those as **Projects** belonging to a client. A client can have many projects of two types:

- **Automation Build** — the existing Launch/Growth journey (intake → contract → brand voice → build → delivery), one per engagement.
- **Site Preview** — the existing preview-sandbox project (uploaded HTML + pin-feedback Kanban).

Top-level "Previews" goes away. Everything is reached from a client.

---

## 1. Data model changes

### New: `client_projects`
A single table that represents any project under a client.

```text
client_projects
  id              uuid pk
  client_id       uuid not null  -> clients.id
  type            text not null  ('automation_build' | 'site_preview')
  name            text not null
  status          text not null  ('active' | 'paused' | 'complete' | 'archived')  default 'active'
  notes           text
  created_at      timestamptz default now()
  updated_at      timestamptz default now()
```

RLS: admins manage; service role manages (mirror existing client tables).

### Link existing rows to a project (don't migrate data shapes — just add a pointer)

- `preview_projects.client_project_id uuid` (nullable initially, then required for new ones).
- `journey_nodes.client_project_id uuid` (nullable). One Automation Build project owns a set of journey_nodes.
- `client_contracts.client_project_id uuid`, `client_deliveries.client_project_id uuid`, `client_checklist_items.client_project_id uuid`, `client_automations.client_project_id uuid` — all nullable, scope each artifact to a specific build project.

### Backfill (one-time SQL in the same migration)

For every existing client:
1. Create one `client_projects` row of type `automation_build`, name = `"<tier> build"`, status derived from journey completion (active vs complete).
2. `UPDATE journey_nodes / contracts / deliveries / checklist_items / client_automations SET client_project_id = <that project's id> WHERE client_id = <client>`.

For every existing `preview_projects` row that has a `client_label` matching a client's `business_name`, create a `site_preview` project under that client and set `preview_projects.client_project_id`. Orphan previews (no match) become projects on a synthetic "Unassigned" client OR stay unlinked and surface in an admin "Unassigned previews" view (we'll do the latter — simpler).

### Trigger updates

- `seed_journey_nodes_for_client()` currently fires on client insert. Change so it also stamps the new nodes with the project_id of the auto-created automation_build project. We'll create that default project in the same trigger (or a sibling trigger) when a client is inserted.

---

## 2. Routing & navigation

### Top nav (`AdminLayout.tsx`)
Remove **Previews**. New nav: Clients · Invites · API Tokens · Profile.

### New routes
```text
/admin                                       Clients list (unchanged shell)
/admin/clients/:id                           Client overview — Projects-first
/admin/clients/:id/projects/:projectId       Project detail (renders by type)
```

Old routes redirect:
- `/admin/previews` → `/admin` (with a toast: "Previews now live under each client")
- `/admin/previews/:id` → `/admin/clients/:clientId/projects/:projectId` (lookup by `preview_projects.client_project_id`)

---

## 3. Client detail page (Projects-first redesign)

Replace the current `ClientDetail.tsx` top section with:

- **Header**: business name, contact, tier, archive toggle (kept).
- **Projects grid**: cards styled like the existing Previews cards (reuse the markup pattern from `Previews.tsx`). Each card shows: type badge ("Automation Build" / "Site Preview"), name, status, last updated, quick actions (open, copy share link for previews).
- **"+ New project"** button → dialog asking type + name (+ tier for automation builds).
- **Secondary "Client info" tab** below the grid: contact details, account access, subscription/SureCart info, brand kit intake — i.e. the bits that aren't tied to a specific build.

The huge journey/contract/brand-voice/delivery UI moves OUT of the client page and INTO the Automation Build project detail page (see §4).

---

## 4. Project detail pages

`/admin/clients/:id/projects/:projectId` renders one of two views based on `client_projects.type`:

### `automation_build` view
Hosts everything currently on `ClientDetail.tsx` that's tied to a single engagement:
- Journey/pipeline (journey_nodes filtered by `client_project_id`)
- AdminContractSection
- Brand voice generation + PDF
- Build start / delivery date / delivery video / build update note
- Checklist items, client_automations, deliveries
- Email tracking panel
- Kickoff webhook status

We will refactor `ClientDetail.tsx` by extracting those blocks into a new `AutomationBuildProject.tsx` and have it accept `projectId` + `clientId`.

### `site_preview` view
Hosts everything currently on `PreviewDetail.tsx`:
- File uploads, page list, share link
- Comments Kanban + replies
- AI Edit dialog
The component is moved/renamed to `SitePreviewProject.tsx` and looked up by `client_project_id` instead of preview project id directly (the underlying `preview_projects` row is still the source of truth for slug/storage).

---

## 5. Edge function adjustments

- `preview-admin`:
  - `create` action now requires `client_id` and creates both a `client_projects` row (type `site_preview`) and the `preview_projects` row, linked.
  - `list` action accepts optional `client_id` to scope to a single client.
- `crm-api` / any client-fetch endpoints: include `projects` array on client responses.
- No changes needed to `preview-serve`, `preview-comments`, `preview-upload`, `preview-ai-edit` — they keep using `preview_projects.id`.

---

## 6. Files touched (high level)

**New**
- `supabase/migrations/<ts>_client_projects.sql` — table, FKs, RLS, backfill.
- `src/pages/admin/ProjectDetail.tsx` — router shim by project type.
- `src/components/admin/projects/AutomationBuildProject.tsx` — extracted journey/contract/brand-voice UI.
- `src/components/admin/projects/SitePreviewProject.tsx` — extracted preview UI.
- `src/components/admin/projects/ProjectsGrid.tsx` — reusable card grid (shared style with old Previews page).
- `src/components/admin/projects/NewProjectDialog.tsx`.

**Edited**
- `src/App.tsx` — new routes, redirects for old preview routes.
- `src/components/admin/AdminLayout.tsx` — remove Previews nav item.
- `src/pages/admin/ClientDetail.tsx` — slim down to header + ProjectsGrid + Client info tab.
- `src/pages/admin/PreviewDetail.tsx` — re-export / redirect through new ProjectDetail.
- `src/pages/admin/Previews.tsx` — delete (or leave as redirect).
- `supabase/functions/preview-admin/index.ts` — accept `client_id` on create/list.

**Deleted later** (after we confirm migration): `src/pages/admin/Previews.tsx`.

---

## 7. Rollout order

1. Migration: add `client_projects`, add `client_project_id` columns, backfill, update seed trigger.
2. Update `preview-admin` edge function to require/accept `client_id`.
3. Build `ProjectsGrid` + `NewProjectDialog`, wire into `ClientDetail`.
4. Extract `AutomationBuildProject` and `SitePreviewProject`, add `ProjectDetail` route.
5. Remove top-level Previews nav + redirects.
6. QA: open an existing client, confirm one Automation Build project exists with the full journey intact; confirm legacy preview links still resolve via redirect.

---

## Open assumptions (flag if wrong)
- Each existing client gets exactly one auto-created Automation Build project (matches today's 1:1 client↔journey reality).
- Orphan previews (no matching client) stay unlinked for now and are surfaced via a small "Unassigned previews" link on the Clients list, not migrated to a placeholder client.
- Status enum stays simple (`active | paused | complete | archived`); we can refine per-type later.
