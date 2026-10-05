-- CRE-249: save-onboarding is intentionally public (the onboarding chat for
-- prospective clients who aren't authenticated yet), so it stays open rather
-- than gaining an auth check. This column backs the cheap per-IP rate limit
-- added in supabase/functions/save-onboarding/index.ts.
ALTER TABLE public.onboarding_submissions
  ADD COLUMN IF NOT EXISTS submitted_ip text;

CREATE INDEX IF NOT EXISTS idx_onboarding_submissions_ip_created
  ON public.onboarding_submissions (submitted_ip, created_at);
