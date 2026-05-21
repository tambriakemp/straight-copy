## Goal

Let admins add an external URL (e.g. `https://menovia-landing.lovable.app`) as a preview. The system auto-discovers the site's pages via Firecrawl, lists each in admin + the client portal with a **View** button, a **Comments thread**, and an **Approve / Unapprove** button. Approvals feed the existing Activity log.

## Why no in-page pins

Sites we don't host block iframe embedding (X-Frame-Options/CSP) and cross-origin script injection, so the existing pin/comment widget can't be injected into an external site. Per-page comment threads are the reliable replacement.

## What changes

### 1. Database (one migration)

- **`preview_projects`** — add columns:
  - `source_type text not null default 'upload'` — `'upload'` | `'external_url'`
  - `external_base_url text` — e.g. `https://menovia-landing.lovable.app`
  - `last_crawled_at timestamptz`
- **`preview_external_pages`** — new table for the discovered page list:
  - `project_id`, `path` (e.g. `/about`), `label`, `order_index`, timestamps
  - Admin-manageable + service role policies (same pattern as other preview_* tables)
- **`preview_page_comments`** — new table for per-page client comments on external previews:
  - `project_id`, `path`, `author_name`, `body`, `created_at`
  - Public insert via edge function only; admin select/manage; service role manages

### 2. Firecrawl connector

Add the Firecrawl connector (server-side `FIRECRAWL_API_KEY`). Used only at create-time and on "Re-crawl" to call `POST /v2/map` and get the URL list. Admin reviews and edits the list before saving.

### 3. Edge functions

- **`preview-crawl`** (new) — admin-only. Body `{ url }` → calls Firecrawl `map`, returns deduped list of relative paths + suggested labels.
- **`preview-approvals`** (existing) — already path/kind based; works as-is for external previews (`kind = 'page'`, `path = '/about'`).
- **`preview-page-comments`** (new) — `GET ?project_id&path` lists comments, `POST` adds one (name + body), `DELETE` for admin removal. Public read/write for the client portal.

### 4. Admin UI (`/admin/previews` + `PreviewDetail`)

- **New "Add preview" flow** with a type toggle: **Upload files** | **External URL**.
- External URL form: paste base URL → "Crawl pages" button calls `preview-crawl` → editable list (add/remove/rename/reorder rows) → Save.
- `PreviewDetail` for external previews: hides upload/file UI, shows the pages table with View link, manual add/remove, "Re-crawl" button, and the existing Activity tab (unchanged — already path-based).

### 5. Client portal (`PortalProjectPreviewCard`)

- For external previews, render each discovered page as a row with:
  - **View** button → opens `external_base_url + path` in a new tab
  - **Approve / Undo** (reuses existing `preview-approvals` call)
  - **Comments** disclosure: thread of prior comments + name + textarea + "Send"
- Approvals continue to flow into the Activity log automatically.

### 6. Review email

`send-preview-review-email` instructions updated to mention that for linked sites, clients leave feedback as comments under each page (since pins aren't available).

## Out of scope

- No iframe embedding attempt, no pin/selector capture on external sites.
- No automatic re-crawl on a schedule — admin triggers it.
- No screenshot capture per page (can add later if useful).

## Secrets needed

- `FIRECRAWL_API_KEY` — added via Firecrawl connector after you approve the plan.
