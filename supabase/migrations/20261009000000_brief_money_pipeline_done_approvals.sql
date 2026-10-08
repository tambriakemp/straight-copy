-- Redesigned brief sections (CRE-366): Money, Pipeline, Done since last
-- digest and Awaiting your approval. Four nullable jsonb siblings to
-- `sections`, same pattern as `calendar_events` (CRE-358) — a brief that
-- doesn't send a field keeps rendering the old markdown section for it
-- (see Today.tsx's `hiddenHeadingSets`). `pipeline` only ever carries the
-- outreach-round banner and hot-leads list; stage counts/totals are read
-- live from pipeline-board (CRE-332), never stored on the brief row.
--
-- Written to be re-runnable: this project takes migrations from both this
-- repo and Lovable's own agent, so every statement here must tolerate
-- being applied twice.

alter table public.briefs add column if not exists money_stats jsonb;
alter table public.briefs add column if not exists pipeline jsonb;
alter table public.briefs add column if not exists done_items jsonb;
alter table public.briefs add column if not exists done_range jsonb;
alter table public.briefs add column if not exists approvals jsonb;
