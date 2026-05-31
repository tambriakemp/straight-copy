ALTER TABLE public.social_posts REPLICA IDENTITY FULL;
ALTER TABLE public.social_post_batches REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.social_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.social_post_batches;