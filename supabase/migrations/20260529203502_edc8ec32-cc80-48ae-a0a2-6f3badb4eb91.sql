
ALTER TABLE public.project_tasks
  ALTER COLUMN acceptance_criteria DROP DEFAULT,
  ALTER COLUMN acceptance_criteria TYPE jsonb USING (
    CASE
      WHEN acceptance_criteria IS NULL OR btrim(acceptance_criteria) = '' THEN '[]'::jsonb
      ELSE jsonb_build_array(jsonb_build_object('id', gen_random_uuid()::text, 'text', acceptance_criteria, 'done', false))
    END
  );

ALTER TABLE public.project_tasks
  ALTER COLUMN acceptance_criteria SET DEFAULT '[]'::jsonb,
  ALTER COLUMN acceptance_criteria SET NOT NULL;
