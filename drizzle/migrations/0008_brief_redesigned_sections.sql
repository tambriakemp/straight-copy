alter table public.briefs add column if not exists money_stats jsonb;
alter table public.briefs add column if not exists pipeline jsonb;
alter table public.briefs add column if not exists done_items jsonb;
alter table public.briefs add column if not exists done_range jsonb;
alter table public.briefs add column if not exists approvals jsonb;