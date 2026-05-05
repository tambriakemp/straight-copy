
# Client Site Preview Sandbox

A self-contained admin section for uploading website mockups (single HTML file or multi-page zip), sharing an unguessable preview URL with clients, and collecting pin-to-element feedback. Fully isolated from the existing Cre8 Visions site/CRM — new admin route, new tables, new public viewer route.

## User Flow

1. Admin → `/admin/previews` → "New Preview Project" → enters client/project name.
2. Admin uploads either:
   - A single `.html` file + loose image assets, OR
   - A `.zip` containing the full site (multi-page, with relative links).
3. System extracts/stores files in Cloud storage under a project-specific folder, generates an unguessable slug (`nanoid`, 24 chars).
4. Admin copies share link: `/p/<slug>` (or `/p/<slug>/<page>` for multi-page).
5. Client opens link → sees the site rendered exactly as uploaded, with a small floating "Leave Feedback" toggle.
6. With feedback mode on, clicking any element drops a numbered pin; client types a comment; saved to DB.
7. Admin sees all pins/comments in `/admin/previews/:id`, can mark resolved, reply, delete.

## Data Model

```text
preview_projects
  id uuid pk
  name text
  client_label text          -- free-text "client name" (no FK to clients table)
  slug text unique           -- 24-char nanoid, used in public URL
  storage_prefix text        -- e.g. "previews/<id>/"
  entry_path text            -- e.g. "index.html"
  is_multi_page boolean
  feedback_enabled boolean default true
  archived boolean default false
  created_at, updated_at

preview_files
  id uuid pk
  project_id uuid fk
  path text                  -- relative path, e.g. "index.html", "img/logo.png"
  content_type text
  size_bytes int
  created_at

preview_comments
  id uuid pk
  project_id uuid fk
  page_path text             -- which page the pin is on
  selector text              -- CSS selector path to anchor element
  x_pct numeric              -- fallback positioning within element bbox
  y_pct numeric
  viewport_width int         -- captured at pin time
  author_name text           -- client types name once, stored in localStorage
  body text
  status text                -- 'open' | 'resolved'
  pin_number int             -- per-project sequence
  created_at, updated_at

preview_comment_replies
  id uuid pk
  comment_id uuid fk
  author_name text           -- "Admin" when posted from admin UI
  body text
  is_admin boolean
  created_at
```

RLS:
- `preview_projects`, `preview_files`, `preview_comment_replies`: admin-only via `is_admin()`.
- `preview_comments`: admins manage all; **anon role** can `INSERT` and `SELECT` rows where `project_id` matches a project resolved by slug (enforced via edge function, not direct table access from public).

## Storage

New private bucket `preview-sites`. Files stored as `previews/<project_id>/<relative_path>`. Served exclusively through a signed-URL-issuing edge function so the unguessable slug is the only access control needed publicly.

## Edge Functions

1. **`preview-upload`** (admin, JWT-protected)
   - Accepts multipart upload: either single HTML+images OR a zip.
   - If zip: unzips server-side (Deno `jsr:@zip-js/zip-js`), validates entry HTML exists, uploads each file to storage, inserts `preview_files` rows.
   - Detects entry: `index.html` if present, else first `.html` in root.
   - Returns project + slug.

2. **`preview-serve`** (public, no JWT)
   - `GET /preview-serve?slug=<slug>&path=<relative>`
   - Looks up project by slug, fetches file from storage, streams back with correct `Content-Type`.
   - For HTML responses, injects a `<script src="/preview-serve?slug=...&path=__feedback.js">` and `<link>` for the feedback widget right before `</body>`.
   - Rewrites root-absolute asset URLs (`/foo.png`) inside HTML to `?path=foo.png` so uploaded sites work without modification.

3. **`preview-comments`** (public, no JWT)
   - `POST { slug, page_path, selector, x_pct, y_pct, viewport_width, author_name, body }` → inserts comment, increments per-project pin counter (DB function `next_pin_number`).
   - `GET ?slug=...&page_path=...` → returns open+resolved comments for rendering pin overlays.

4. **`preview-admin`** (admin, JWT-protected)
   - List/get/archive projects, list comments, post replies, change comment status, delete project (cascades storage cleanup).

## Frontend

### Admin pages (added under existing `RequireAdmin` shell)
- `src/pages/admin/Previews.tsx` — list/create projects, copy share links, archive.
- `src/pages/admin/PreviewDetail.tsx` — file list, share link, pin feed grouped by page, reply UI, status toggle.
- Nav entry in `AdminLayout.tsx`: `▤ Previews`.

### Public viewer route
- `src/pages/PreviewViewer.tsx` mounted at `/p/:slug/*`.
- Renders the served HTML inside an `<iframe>` pointing at `preview-serve` (sandboxed `allow-scripts allow-same-origin allow-forms`).
- Iframe document loads injected `feedback-widget.js` which:
  - Renders a fixed bottom-right toggle "Leave feedback".
  - On enable, intercepts clicks → captures unique CSS selector (custom small util, no library) + bbox-relative `x%`/`y%` → opens a small dialog → posts to `preview-comments`.
  - Renders existing pins as numbered dots positioned over their target element (re-positioned on resize/scroll via `ResizeObserver` + `getBoundingClientRect`).
  - Stores `author_name` in `localStorage` on first comment so subsequent ones don't re-prompt.

### Routing
- Add `<Route path="/p/:slug/*" element={<PreviewViewer />} />` and `/admin/previews` + `/admin/previews/:id` (admin-guarded) in `App.tsx`.

## Technical Notes

- `nanoid` already pulls in nicely; if not present, use `crypto.randomUUID().replace(/-/g,'').slice(0,24)`.
- Zip extraction in Deno: `jsr:@zip-js/zip-js` works in edge runtime; reject zips >50MB and >500 files.
- HTML rewriting: lightweight regex pass on `src=`, `href=`, `url(...)` for `/`-rooted paths is sufficient for typical mockups (the Magna Tax example is fully self-contained inline CSS+SVG, so it'll just work).
- Iframe sandboxing prevents the uploaded site from breaking out into the parent app; the feedback widget runs **inside** the iframe (injected by `preview-serve`), and posts comments directly to the public edge function.
- Pin selectors use a tiny generator (`nodeName + nth-of-type` chain up to body) — robust enough for static mockups.

## Out of Scope (v1)

- No client-side authentication on preview links (slug-only, per your choice).
- No real-time push of new comments to admin (admin page polls every 10s while open).
- No Figma-style hover highlighting between pin list and page (could add later).
- No version history of uploads (re-upload replaces files; could add later).

## Files Created / Edited

**New:**
- `supabase/migrations/<ts>_preview_sandbox.sql` (tables, bucket, RLS, `next_pin_number`)
- `supabase/functions/preview-upload/index.ts`
- `supabase/functions/preview-serve/index.ts`
- `supabase/functions/preview-comments/index.ts`
- `supabase/functions/preview-admin/index.ts`
- `src/pages/admin/Previews.tsx`
- `src/pages/admin/PreviewDetail.tsx`
- `src/pages/PreviewViewer.tsx`
- `src/lib/preview-feedback-widget.ts` (source for the injected script; bundled to a static string the edge function serves)

**Edited:**
- `src/App.tsx` — add routes
- `src/components/admin/AdminLayout.tsx` — add nav item
