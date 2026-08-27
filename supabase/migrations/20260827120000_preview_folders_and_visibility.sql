-- Folders for the client preview, and the ability to retire a page from it.
--
-- Idempotent throughout — two writers, see 20260823120000.
--
-- A project accumulates rounds. Michigan Health Specialist currently holds
-- MIH v2, v3 and v4, MHS Variation B and C in two colourways, and the 21 pages
-- of the finished site — in one flat list, in which the concepts and the live
-- website are indistinguishable. Nothing in the schema could express the
-- difference: there is no grouping column anywhere in the preview system, and
-- preview_files has no ordering or label either, so uploaded pages come out
-- ORDER BY path (which is why MIH v10 would sort above MIH v3).

-- ---------------------------------------------------------------------------
-- 1. External pages. These already carry label and order_index.
-- ---------------------------------------------------------------------------
ALTER TABLE public.preview_external_pages
  ADD COLUMN IF NOT EXISTS group_label       text,
  ADD COLUMN IF NOT EXISTS visible_to_client boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 2. Uploaded files. These carry none of it.
--
--    `path` has been doing four jobs at once: storage key, display name,
--    approval key and comment key. label lets the display name move without
--    breaking the other three, which is also why renaming a file today orphans
--    its approvals and comments.
-- ---------------------------------------------------------------------------
ALTER TABLE public.preview_files
  ADD COLUMN IF NOT EXISTS label             text,
  ADD COLUMN IF NOT EXISTS order_index       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS group_label       text,
  ADD COLUMN IF NOT EXISTS visible_to_client boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.preview_files.group_label IS
  'Folder this page appears under in the client portal. NULL groups with everything else of its kind.';
COMMENT ON COLUMN public.preview_files.visible_to_client IS
  'False retires a page from the portal entirely — it is filtered out server-side, not merely hidden, and cannot be approved.';
COMMENT ON COLUMN public.preview_external_pages.group_label IS
  'Folder this page appears under in the client portal. NULL groups with everything else of its kind.';
COMMENT ON COLUMN public.preview_external_pages.visible_to_client IS
  'False retires a page from the portal entirely — it is filtered out server-side, not merely hidden, and cannot be approved.';

-- The portal filters on these on every load, and both are overwhelmingly true.
CREATE INDEX IF NOT EXISTS preview_files_visible_idx
  ON public.preview_files (project_id) WHERE visible_to_client;
CREATE INDEX IF NOT EXISTS preview_external_pages_visible_idx
  ON public.preview_external_pages (project_id) WHERE visible_to_client;

-- ---------------------------------------------------------------------------
-- 3. Give the existing rows a sensible starting shape.
--
--    Only where nothing has been set, so re-running cannot undo hand-sorting.
--    Uploaded pages default to "Design concepts" and external ones to
--    "Website pages" — the split that already exists in people's heads and
--    which the flat list was hiding.
-- ---------------------------------------------------------------------------
UPDATE public.preview_files
   SET group_label = 'Design concepts'
 WHERE group_label IS NULL
   AND path ~* '\.html?$';

UPDATE public.preview_external_pages
   SET group_label = 'Website pages'
 WHERE group_label IS NULL;

-- Seed order_index from the alphabetical order they were already coming out in,
-- so nothing visibly jumps on the first load after this ships.
WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY project_id ORDER BY path) - 1 AS n
    FROM public.preview_files
)
UPDATE public.preview_files f
   SET order_index = ordered.n
  FROM ordered
 WHERE ordered.id = f.id
   AND f.order_index = 0;
