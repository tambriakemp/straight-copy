
-- 1) Draft/publish fields on wiki_documents
ALTER TABLE public.wiki_documents
  ADD COLUMN IF NOT EXISTS draft_title text,
  ADD COLUMN IF NOT EXISTS draft_content text,
  ADD COLUMN IF NOT EXISTS draft_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS has_draft boolean NOT NULL DEFAULT false;

-- Backfill: docs that are currently Active count as already published
UPDATE public.wiki_documents
   SET published_at = COALESCE(published_at, updated_at)
 WHERE status = 'Active' AND published_at IS NULL;

-- 2) wiki_folders table
CREATE TABLE IF NOT EXISTS public.wiki_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES public.wiki_folders(id) ON DELETE CASCADE,
  department text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wiki_folders TO authenticated;
GRANT ALL ON public.wiki_folders TO service_role;

ALTER TABLE public.wiki_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active staff read wiki_folders"
  ON public.wiki_folders FOR SELECT TO authenticated
  USING (public.has_wiki_access(auth.uid()));

CREATE POLICY "Founders manage wiki_folders"
  ON public.wiki_folders FOR ALL TO authenticated
  USING (public.is_wiki_founder(auth.uid()))
  WITH CHECK (public.is_wiki_founder(auth.uid()));

CREATE POLICY "Service role manages wiki_folders"
  ON public.wiki_folders FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_wiki_folders_updated
  BEFORE UPDATE ON public.wiki_folders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Link documents to folders
ALTER TABLE public.wiki_documents
  ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES public.wiki_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wiki_documents_folder ON public.wiki_documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_wiki_folders_parent ON public.wiki_folders(parent_id);
