## Goal

Add an "AI Edit" tool to each page in the Preview Detail screen that lets you:

1. Type a natural-language prompt to modify the page's HTML directly (no JS injection — actual file rewrite).
2. Optionally attach one or more images that get uploaded as project assets and embedded into the page where the prompt asks.

Example: open `Magna Tax Relief Home Page.html`, attach the team photo, prompt "Replace the 'Drop a hero photo' placeholder with this image, cropped to fill the frame." → tool uploads the image to the project's storage prefix, calls Gemini with the page HTML + asset list + prompt, writes the returned HTML back to storage.

## UX

In the Pages tab, each page row gets a new "Edit with AI" button (sparkles icon) next to Preview/Delete.

Clicking opens a modal:
- Header: page filename
- Image attachments dropzone (multi-image, optional). Shows thumbnails with the suggested filename it'll be saved as.
- Prompt textarea
- Recent attached/available assets list (collapsible) so the model knows what filenames it can reference
- Buttons: "Preview diff" (optional, v2) / "Apply changes" / "Cancel"

On Apply:
1. Upload any attached images via existing `preview-upload` flow (or inline in new action) → stored at `images/<slug>.<ext>` under the project's prefix.
2. Call new edge function `preview-ai-edit` with `{ project_id, page_path, prompt, new_assets: [{path, mime}] }`.
3. Function returns updated HTML; client toasts success and reloads.

## Backend: new edge function `preview-ai-edit`

- Auth: requires admin user (mirror `preview-admin` auth check).
- Loads the page HTML from `preview-sites/<storage_prefix><page_path>`.
- Loads the project's full file list (paths only) so the model knows what assets exist.
- Calls Lovable AI Gateway (`google/gemini-2.5-pro`) with system prompt:
  > "You edit a single HTML file for a static preview site. Return ONLY the full updated HTML, no fences, no commentary. Available asset paths (use relative URLs): {list}. Newly uploaded assets you SHOULD use when relevant: {new_assets}. User instruction: {prompt}. Preserve all unrelated markup. Do not add `<script>` tags unless explicitly requested. Prefer plain `<img>`, CSS background-image, and inline styles for visual changes."
- Validates response starts with `<!doctype` or `<html` (strips ```html fences if present).
- Uploads new HTML back to storage (overwrite, same content-type).
- Updates `preview_files.size_bytes` for that row.
- Returns `{ ok: true, bytes }`.

Uses `LOVABLE_API_KEY` (already available via Lovable AI). No extra secrets.

## Backend: image attachments

Add an action `file_upload_single` to `preview-admin` (simpler than reusing the multipart preview-upload from a JSON flow): accepts `{ project_id, path, content_base64, mime }`, writes to storage + upserts `preview_files` row. Used by the modal to drop in attached images before calling `preview-ai-edit`.

## Frontend changes

- New component `src/components/admin/preview/AiEditDialog.tsx` — modal with dropzone, prompt textarea, asset list, submit handler.
- `PreviewDetail.tsx`: add Sparkles button to each page row → opens dialog with that path.
- After success, call existing `load()` so the file list and any size changes refresh.

## Out of scope (future)

- Diff preview before apply (v2).
- Editing CSS/JS files (only HTML pages for now).
- Multi-page edits in one prompt.

## Files to create / edit

- create `supabase/functions/preview-ai-edit/index.ts`
- edit `supabase/functions/preview-admin/index.ts` (add `file_upload_single` action)
- create `src/components/admin/preview/AiEditDialog.tsx`
- edit `src/pages/admin/PreviewDetail.tsx` (add button + dialog wiring)
