## Goal

For marketing projects, add two pieces under the project view:

1. A **Social Images** library inside the Social tab — upload images, auto-generate captions + hashtags, preview as a 4-per-row grid, multi-select for CRUD, and a "Send to CoPost" action.
2. A **CoPost API** setting in the Settings tab (the existing CoPostSettingsCard isn't currently mounted for marketing projects).

## UX

**Social tab — new "Images" sub-view**
- Add a third toggle alongside the existing "Batches" / "Templates" toggle: `Batches | Templates | Images`.
- Images view:
  - Drag-and-drop / file picker upload (multi-file, jpg/png/webp, max 10 MB each).
  - On upload: image is stored, then analyzed by AI; caption + hashtags appear underneath the thumbnail.
  - Grid: `repeat(4, 1fr)` on desktop, 2 on tablet, 1 on mobile.
  - Each tile shows: image, caption (editable inline), hashtag chips, status badge, checkbox.
  - Tile badge "Sent to CoPost ✓" with timestamp once sent.
  - Bulk bar (appears when ≥1 selected): Select all / Clear / Delete / Regenerate caption / **Send N to CoPost**.
  - Per-tile menu: Edit caption, Regenerate caption, Copy caption, Download, Delete.

**Settings tab — new card**
- Mount the existing `CoPostSettingsCard` under the Settings tab for marketing projects (above the progress-report card).

## Technical details

### Database (one migration)
- New table `public.social_images`:
  - `id`, `client_project_id` (FK), `storage_path`, `mime_type`, `size_bytes`, `width`, `height`
  - `caption text`, `hashtags text[]`, `caption_status text default 'pending'` (pending/ready/error), `caption_error text`
  - `copost_status text default 'idle'` (idle/sending/sent/error), `copost_sent_at timestamptz`, `copost_error text`
  - `created_by uuid`, `created_at`, `updated_at`
- GRANT to `authenticated` + `service_role`; enable RLS.
- Policies: admins (via `is_admin(auth.uid())`) can do everything; service_role bypass.
- Indexes on `client_project_id`, `copost_status`.

### Storage
- New private bucket `social-images` (10 MB cap, image mime allow-list).
- RLS on `storage.objects`: admin-only insert/select/delete scoped to bucket.

### Edge functions
- `analyze-social-image` (new): admin-gated. Input `{ image_id }`. Loads row, signs URL, calls Lovable AI (`google/gemini-3-flash-preview`) with image + system prompt to produce `{ caption, hashtags[] }`. Writes back to row, sets `caption_status='ready'`. On error sets `caption_status='error'` with message.
- `regenerate-social-image-caption` (new): same as above but force-refresh; supports bulk via `{ image_ids: string[] }`.
- `send-images-to-copost` (new): admin-gated. Input `{ image_ids: string[] }`. For each id:
  - Verify same `client_project_id`, status not already `sent`.
  - Load `copost_endpoint_url` from `project_secrets` (reuse existing pattern from `send-to-copost`).
  - Build 30d signed URL with `#.png` suffix (same trick already used).
  - POST `{ postText: caption + hashtags, images: [url], tags: [...] }`.
  - On success: set `copost_status='sent'`, `copost_sent_at=now()`.
  - On failure: set `copost_status='error'`, `copost_error=msg`.
  - Return per-image results.

### Client code
- New `src/components/admin/social/ImagesPanel.tsx` (grid + selection + bulk bar + upload dropzone).
- New `src/components/admin/social/ImageTile.tsx` (thumbnail, caption editor, badges, per-tile menu).
- Extend `SocialTab.tsx` to add `view: 'batches' | 'templates' | 'images'` and render `ImagesPanel`.
- Upload flow:
  1. Client uploads to `social-images/{client_project_id}/{uuid}.{ext}` via supabase-js.
  2. Insert row in `social_images` with `caption_status='pending'`.
  3. Invoke `analyze-social-image` (fire-and-forget; UI subscribes to row changes via realtime).
- Realtime subscription on `social_images` filtered by `client_project_id` to refresh tiles when captions land or CoPost status changes.
- Inline caption editing writes directly to the row (admins only via RLS).

### Settings tab wiring
- In `src/pages/admin/AppDevelopmentView.tsx`, inside the `settings` tab content, render `<CoPostSettingsCard clientProjectId={projectId!} />` above `ProgressReportSettingsCard` **only when** `isMarketing` is true.

## Out of scope
- No changes to the existing Batches / Templates flows.
- No scheduling / queueing — Send to CoPost is on-demand.
- No video uploads (images only for this iteration).
