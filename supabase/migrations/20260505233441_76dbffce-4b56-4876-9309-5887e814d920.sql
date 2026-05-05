ALTER TABLE public.preview_comments ADD COLUMN IF NOT EXISTS edit_token text;
ALTER TABLE public.preview_comment_replies ADD COLUMN IF NOT EXISTS edit_token text;