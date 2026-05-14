# Embed Preview inside projects + new project types

## Goal

- Replace the standalone "Site Preview" project type with an embeddable **Preview card** that can live inside any project.
- Project types going forward: **Automation Build**, **App Development**, **Web Development**, **Marketing**.
- App Development, Web Development, and Marketing projects get a Preview card. Automation Build does not.
- Preview functionality (upload, slug URL, comments, AI edit, etc.) is unchanged — same component, same data, same edge function.
- Existing `site_preview` projects keep working untouched (legacy compatibility, no broken links).
- Magna's existing preview gets re-homed into a Web Development project without changing its slug/URL/files/comments.

---

## Changes

### 1. Project types (no DB schema change)

`client_projects.type` is a free-text column today (no enum constraint), so no migration is needed for the type itself. We just start writing the two new values:

- `web_development`
- `marketing`

`automation_build`, `app_development`, and legacy `site_preview` continue to exist.

### 2. New project dialog (`src/pages/admin/ClientDetail.tsx`)

Replace the type dropdown options with:
- Automation Build
- App Development
- Web Development *(new)*
- Marketing *(new)*

Remove "Site Preview" as a creatable option. Existing site_preview projects still render in the list (legacy label kept in `TYPE_LABEL`).

Creation flow:
- **Automation Build** — unchanged (seeds journey nodes from tier templates).
- **App / Web / Marketing** — same path as today's `app_development` branch: insert a `client_projects` row with the chosen type, navigate to its detail page. No preview row is auto-created — the Preview card handles that on demand.

Card rendering in the project list:
- Add icons + `TYPE_LABEL` entries for `web_development` (Globe icon) and `marketing` (Megaphone icon).
- Render them with the same non-build card layout currently used for `app_development`.
- Legacy `site_preview` cards keep their current rendering (slug copy, open link, etc.).

### 3. Project detail routing (`src/pages/admin/ProjectDetail.tsx`)

- `automation_build` → `AutomationBuildView` *(unchanged)*
- `site_preview` → `PreviewDetail` *(unchanged — legacy)*
- `app_development`, `web_development`, `marketing` → render a generic project view that includes the existing project sections (proposals, contract, invoices, resources, etc.) **plus a new Preview card**.

Today `AppDevelopmentView` already contains the right shell for app_development. We will:
- Rename it conceptually to a generic "ProjectWorkspaceView" (keep file or rename to `ProjectWorkspaceView.tsx`) and use it for all three types.
- Adjust its header label to read the project's type via `TYPE_LABEL`.
- Mount the new `<ProjectPreviewCard projectId={project.id} clientId={project.client_id} />` inside it.

### 4. New `ProjectPreviewCard` component

Path: `src/components/admin/ProjectPreviewCard.tsx`

Behavior:
1. On mount, query `preview_projects` where `client_project_id = projectId` (maybeSingle).
2. **No preview yet** — show a collapsible card with a single "Create preview" button. Clicking it invokes `preview-admin` with `action: "create"` (existing function) passing `client_id`, `name = parent project name`, `client_label = business_name`. The edge function already creates a `preview_projects` row + a sibling `client_projects` row of type `site_preview` and links them via `client_project_id`. **We need to adjust that branch** so that when called from inside an existing project, it attaches the preview to the *current* project instead of spawning a new `site_preview` client_project.
3. **Preview exists** — render a collapsible card showing slug, copy link, open-in-new-tab, and an embedded `<PreviewDetail overrideId={previewId} embedded />` (new optional `embedded` prop hides the AdminLayout wrapper + back link so it nests cleanly).

### 5. `preview-admin` edge function tweak

In `supabase/functions/preview-admin/index.ts`, the `create` action currently always inserts a new `client_projects` row of type `site_preview`. Add an optional `attach_to_project_id` body param:
- If provided, skip the insert and use that id as `client_project_id` on the new `preview_projects` row.
- If absent, keep current behavior (legacy path used by ClientDetail's old "Site Preview" creation, kept for safety even though the UI no longer triggers it).

### 6. Make `PreviewDetail` embeddable

Add an optional `embedded?: boolean` prop. When true:
- Skip rendering `<AdminLayout>` wrapper and the "Back to client" link.
- Render directly so it can sit inside another page's content area.
- Everything else (tabs, files, comments, AI edit) unchanged.

### 7. Magna migration (data only, no deletes)

Magna currently has one project:

```
id: 4ea66fdf-edf9-403a-aa04-cc2afc969151
name: Magna Tax Relief
type: site_preview
```

The linked `preview_projects` row already references this `client_project_id`. To "move" the preview into a Web Development project without changing its slug/files/comments/links, we simply flip the project's type:

```sql
UPDATE client_projects
SET type = 'web_development', updated_at = now()
WHERE id = '4ea66fdf-edf9-403a-aa04-cc2afc969151';
```

After the flip:
- Same `client_project_id`, same `preview_projects` row, same slug, same `/p/<slug>` URL.
- The project now opens in the new Web Development workspace, with the Preview card already populated by the existing `preview_projects` row.
- Nothing is deleted; no preview link changes.

---

## Out of scope

- No changes to `journey_nodes`, `journey_templates`, contracts, invoices, or proposals.
- No changes to the public `/p/<slug>` viewer.
- No changes to other clients' existing `site_preview` projects — they continue rendering with the legacy full-page `PreviewDetail`.

## Files touched

- `src/pages/admin/ClientDetail.tsx` — new type options, icons, card rendering.
- `src/pages/admin/ProjectDetail.tsx` — route the 3 new/extended types into the workspace view.
- `src/pages/admin/AppDevelopmentView.tsx` — generalize to handle all 3 types; mount Preview card.
- `src/pages/admin/PreviewDetail.tsx` — add `embedded` prop.
- `src/components/admin/ProjectPreviewCard.tsx` — **new** collapsible card.
- `supabase/functions/preview-admin/index.ts` — accept `attach_to_project_id` in `create`.
- One migration: flip Magna's project type to `web_development`.
