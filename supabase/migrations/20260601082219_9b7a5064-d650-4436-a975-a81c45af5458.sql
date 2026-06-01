ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS review_email_subject text,
  ADD COLUMN IF NOT EXISTS review_email_html text;