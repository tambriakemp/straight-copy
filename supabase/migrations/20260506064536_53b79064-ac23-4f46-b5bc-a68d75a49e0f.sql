
-- Enums
CREATE TYPE public.wiki_role AS ENUM ('founder','intern','contractor');
CREATE TYPE public.wiki_doc_status AS ENUM ('Draft','Active','Archived');
CREATE TYPE public.wiki_access_level AS ENUM ('Founder Only','All Staff');

-- User roles for the wiki
CREATE TABLE public.wiki_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  name text NOT NULL,
  email text NOT NULL,
  role public.wiki_role NOT NULL DEFAULT 'intern',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wiki_user_roles ENABLE ROW LEVEL SECURITY;

-- Helpers
CREATE OR REPLACE FUNCTION public.is_wiki_founder(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = _user_id)
    OR EXISTS (
      SELECT 1 FROM public.wiki_user_roles
      WHERE user_id = _user_id AND role = 'founder' AND active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.has_wiki_access(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_wiki_founder(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.wiki_user_roles
      WHERE user_id = _user_id AND active = true
    );
$$;

-- Documents
CREATE TABLE public.wiki_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  department text NOT NULL,
  doc_type text NOT NULL,
  content text NOT NULL DEFAULT '',
  owner text,
  status public.wiki_doc_status NOT NULL DEFAULT 'Draft',
  access_level public.wiki_access_level NOT NULL DEFAULT 'All Staff',
  tags text[] NOT NULL DEFAULT '{}',
  last_reviewed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wiki_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_wiki_documents_dept ON public.wiki_documents(department);
CREATE INDEX idx_wiki_documents_type ON public.wiki_documents(doc_type);
CREATE INDEX idx_wiki_documents_updated ON public.wiki_documents(updated_at DESC);
CREATE INDEX idx_wiki_documents_tags ON public.wiki_documents USING GIN(tags);
CREATE INDEX idx_wiki_documents_search ON public.wiki_documents
  USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')));

-- Revisions
CREATE TABLE public.wiki_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.wiki_documents(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  change_note text,
  edited_by uuid,
  edited_by_name text,
  edited_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wiki_revisions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_wiki_revisions_doc ON public.wiki_revisions(document_id, edited_at DESC);

-- updated_at triggers
CREATE TRIGGER trg_wiki_documents_updated
BEFORE UPDATE ON public.wiki_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_wiki_user_roles_updated
BEFORE UPDATE ON public.wiki_user_roles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: wiki_user_roles
CREATE POLICY "Founders manage wiki roles"
ON public.wiki_user_roles FOR ALL TO authenticated
USING (public.is_wiki_founder(auth.uid()))
WITH CHECK (public.is_wiki_founder(auth.uid()));

CREATE POLICY "Users see their own wiki role"
ON public.wiki_user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Service role manages wiki_user_roles"
ON public.wiki_user_roles FOR ALL TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- RLS: wiki_documents
CREATE POLICY "Founders manage wiki_documents"
ON public.wiki_documents FOR ALL TO authenticated
USING (public.is_wiki_founder(auth.uid()))
WITH CHECK (public.is_wiki_founder(auth.uid()));

CREATE POLICY "Active staff read All Staff docs"
ON public.wiki_documents FOR SELECT TO authenticated
USING (
  access_level = 'All Staff'
  AND EXISTS (
    SELECT 1 FROM public.wiki_user_roles r
    WHERE r.user_id = auth.uid() AND r.active = true
  )
);

CREATE POLICY "Service role manages wiki_documents"
ON public.wiki_documents FOR ALL TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- RLS: wiki_revisions
CREATE POLICY "Founders manage wiki_revisions"
ON public.wiki_revisions FOR ALL TO authenticated
USING (public.is_wiki_founder(auth.uid()))
WITH CHECK (public.is_wiki_founder(auth.uid()));

CREATE POLICY "Staff read revisions of accessible docs"
ON public.wiki_revisions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.wiki_documents d
    WHERE d.id = document_id
      AND d.access_level = 'All Staff'
      AND EXISTS (
        SELECT 1 FROM public.wiki_user_roles r
        WHERE r.user_id = auth.uid() AND r.active = true
      )
  )
);

CREATE POLICY "Service role manages wiki_revisions"
ON public.wiki_revisions FOR ALL TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
