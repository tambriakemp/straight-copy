ALTER TABLE public.prospect_approvals
  ADD COLUMN IF NOT EXISTS rebuild_round integer NOT NULL DEFAULT 0;