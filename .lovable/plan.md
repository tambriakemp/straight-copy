# Preview Sandbox — SureFeedback-style overhaul

Three problems to solve, plus a foundational improvement:
1. Page header looks empty (project name invisible against white card).
2. File list gets messy as projects grow.
3. Feedback is a flat list — needs a kanban board (Open / In Progress / Resolved).
4. Asset references in uploaded HTML don't resolve when filenames don't match (e.g. HTML expects `assets/logo.png`, upload contains `Magna Logo.png`).

## 1. Detail page header redesign

Replace the flat white share-link card with an editorial header block:

```text
┌──────────────────────────────────────────────────────────┐
│ ← Back to previews                                       │
│                                                          │
│ MAGNA TAX RELIEF                       [Open] [Archive]  │
│ Client · Single page · 9 files · 3 open comments         │
│                                                          │
│ ┌─ Share link ──────────────────────────────────────┐   │
│ │ https://…/p/lfwbf…   [copy]  [open ↗]            │   │
│ └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

- Project name in Cormorant Garamond, large, ink color (matches site aesthetic).
- Subtitle in 11px uppercase tracked label style.
- Stats row shows file count and open feedback count.
- Share-link block sits below as a distinct module, not inline.

## 2. Files section redesign

Group files by folder, collapse heavy lists:

- **Pages** (HTML files) shown first as cards with a Preview button + "Set as entry" star toggle.
- **Assets** (images, CSS, JS, fonts) collapsed into a single expandable group with file counts per type (e.g. "6 images, 1 script").
- Drag-and-drop dropzone replaces the two upload buttons (still keeps folder/zip pickers as secondary).
- Per-file delete action.

```text
PAGES
┌────────────────────────────────────────────┐
│ ★  Magna Tax Relief Home Page.html         │
│    Entry page · 64 KB         [Preview ↗]  │
├────────────────────────────────────────────┤
│    about.html                              │
│    12 KB              [Set entry] [Preview]│
└────────────────────────────────────────────┘

ASSETS (8)  ▾
  Images (6) · Scripts (1) · Other (1)
```

## 3. Kanban feedback board

Replace the flat comment list with three columns: **Open**, **In Progress**, **Resolved**.

- Add new comment status: `in_progress` (DB currently allows free-text status, no migration needed beyond updating the widget/admin to use it).
- Drag-and-drop between columns to change status (using HTML5 drag events — no extra deps).
- Each card shows: pin #, author, page, snippet of comment, reply count, age.
- Click card → opens a side drawer with full comment, replies, and reply input.
- Filter bar above board: by page (dropdown of distinct `page_path` values), by author.

```text
OPEN (3)         IN PROGRESS (1)     RESOLVED (5)
┌──────────┐    ┌──────────┐        ┌──────────┐
│ #4 Logo  │    │ #2 Hero  │        │ #1 Color │
│ too big  │    │ copy …   │        │ tweak    │
│ home · 2h│    │ home · 1d│        │ home · 3d│
└──────────┘    └──────────┘        └──────────┘
```

## 4. Asset resolution: basename fallback

When `preview-serve` can't find a file at the resolved path, fall back to matching by **basename** across all files in the project (case-insensitive). Logged for debugging via response header `X-Preview-Resolved-Via: basename`.

This fixes the Magna Tax Relief case where the HTML references `assets/logo-full-cropped.png` but the upload only contains `Magna Tax Relief Logo.png` etc. — admin can rename uploaded files to match, OR we surface a "missing assets" warning in the admin UI listing the references that couldn't be resolved.

Also add: a **"Missing assets"** panel in admin showing references parsed out of HTML files that have no matching upload (basename or path), so you know what to upload/rename.

## 5. Multi-page support polish

`is_multi_page` already exists on the schema. With the new Pages section, multi-page projects work naturally — each HTML becomes a page. Also:

- Toggle "Set as entry" per page (writes `entry_path` via `preview-admin`).
- Page navigator in the public viewer: a small floating page-switcher pill in the bottom-left corner of the iframe parent (alongside the feedback toggle) listing all HTML files when `is_multi_page` is true. This requires the viewer to know the file list — fetched from a new public `preview-admin` action `pages` (returns just `[{path, is_entry}]`).

## Technical notes

- **Files edited**: `src/pages/admin/PreviewDetail.tsx` (full rewrite of layout), `supabase/functions/preview-serve/index.ts` (basename fallback + missing-asset reporter via `?path=__pf_missing` JSON endpoint), `supabase/functions/preview-admin/index.ts` (new `pages` and `missing_assets` actions, accept `entry_path` in `update`), `src/pages/PreviewViewer.tsx` (page switcher overlay for multi-page projects).
- **No DB migration required** — `status` is free-text and `entry_path`/`is_multi_page` already exist. Comment status drag uses existing `comment_status` action.
- **No new dependencies** — drag-drop with native HTML5, drawer with existing shadcn `Sheet` component.
- **Styling** uses existing `crm-*` classes plus design tokens (cream/stone/ink) per project memory; no inline color literals.

## Out of scope for this pass
- Email notifications when new feedback lands (can add later).
- Per-page screenshots/thumbnails.
- Client-side login for commenters (stays anonymous-with-name).
