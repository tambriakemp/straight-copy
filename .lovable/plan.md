## Goal

Three changes:
1. Restructure the client portal so a client can have multiple projects (mirrors the admin layout). Existing portal URLs must keep working.
2. Surface preview links to clients inside each project view (read-only, no file management).
3. Let admins rename a preview link.

Existing previews and portal links continue to work unchanged.

---

## 1. Multi-project client portal

### Routing

- Keep `/portal/:clientId` — now becomes a **project index** that lists every non-archived project for the client.
- Add `/portal/:clientId/projects/:projectId` — a **project view** that holds the project-specific sections.
- All current emails / share links land on `/portal/:clientId`. If the client has only one project, the index can auto-redirect to that project view (so single-project clients don't lose a click). Otherwise they see the list.

### Project index page (new `PortalHome`)

- Reuses the current portal header + hero (welcome line, build/delivery dates if set).
- Below the hero: a card grid of the client's projects, one card per `client_projects` row (excluding `site_preview`, excluding archived).
  - Card shows: project type label + icon (Automation Build / App Dev / Web Dev / Marketing), project name, status, last updated.
  - Card click → `/portal/:clientId/projects/:projectId`.

### Project view page (new `PortalProject`)

Sections rendered conditionally on project type:

- **Automation Build** — moves the existing client-level sections under this project:
  - Brand Voice intake accordion
  - Contract section
  - Account Access section
  - Subscription section
  - Brand Kit chat / confirmation card
  - Delivery video card (if set)
  - Active journey node chip in header
- **App Development / Web Development / Marketing**:
  - Proposals section (filtered to this project)
  - Active Invoice section (filtered to this project)
  - **Preview card** (read-only, see section 2)

### Backend changes

- `brand-kit-intake` `resolve` action already returns `projectTypes`. Extend the response to include a list of `projects` (id, type, name, status, updated_at) so the index can render without a separate request.
- `ProposalsSection` and `InvoiceSection` currently fetch by `clientId`. Add an optional `projectId` prop; when set, filter to that project only. The aggregated client-level rendering stays available for fallback but the new portal pages always pass `projectId`.

### Data integrity

- No migration needed. Project rows already exist; we just expose them per-route.
- The legacy "Site Preview" project type is hidden from the portal project list (those are admin-only).

---

## 2. Preview link card on the client portal

- New component `PortalProjectPreviewCard` (lives in `src/components/portal/`).
- Shown inside the App Dev / Web Dev / Marketing project view.
- Loads the `preview_projects` row attached to the project.
- If a preview exists: shows the preview name, the share URL, "Open preview" button, and a copy-link button. **No file upload, no comment management, no archive controls.** It is purely a launch surface for the client.
- If no preview exists yet: shows a quiet "Your preview isn't ready yet" placeholder (no create button on the client side).
- Styling matches the existing portal card visual language (cream-on-ink, Cormorant title, tracked uppercase eyebrow).

---

## 3. Editable preview names

- `preview-admin` edge function `update` action already accepts arbitrary fields; confirm it allows `name` updates (it currently does via the generic update path).
- Admin UI:
  - In `PreviewDetail.tsx` header, make the preview title click-to-edit (inline pencil icon → input + save/cancel). On save, call `preview-admin` `update` with `{ id, name }` and refresh.
  - In `ProjectPreviewCard.tsx` (admin-side embedded card), surface the same rename affordance next to the slug pill, so admins can rename without leaving the project view.
- Client-facing portal preview card displays the updated name automatically.

---

## Files touched

**New**
- `src/pages/PortalHome.tsx` (project index, replaces today's `Portal.tsx` shell)
- `src/pages/PortalProject.tsx` (per-project view, holds the existing portal sections)
- `src/components/portal/PortalProjectPreviewCard.tsx`

**Modified**
- `src/App.tsx` — add `/portal/:clientId/projects/:projectId` route; point `/portal/:clientId` at `PortalHome`.
- `src/pages/Portal.tsx` — split into the two new pages (or kept as a thin wrapper if helpful for diff size).
- `src/components/portal/ProposalsSection.tsx`, `src/components/portal/InvoiceSection.tsx` — accept optional `projectId`.
- `src/pages/admin/PreviewDetail.tsx` — inline rename affordance.
- `src/components/admin/ProjectPreviewCard.tsx` — inline rename affordance.
- `supabase/functions/brand-kit-intake/index.ts` — return `projects` array in `resolve`.

No DB migrations. No changes to share-link slugs, preview URLs, or existing client portal URLs.

---

## Risks / notes

- The existing `Portal.tsx` is large; the split needs care so the Brand Kit chat behavior, deep-link `?focus=` handling, and admin-preview banner all keep working — they move with the Automation Build sections into `PortalProject`.
- Single-project clients should not lose the current 1-click experience — the auto-redirect from index → only-project handles that.
