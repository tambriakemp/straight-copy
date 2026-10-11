-- Decide section wiring (CRE-393 §B). Two small tables:
--
--   decide_snoozes   -- "Not now": Bree snoozes a Decide card for a day or
--                        until Monday. Read+write straight from the browser,
--                        same pattern as app_secrets in 20261005120000_briefs_core.sql
--                        -- there is no side effect to a snooze beyond
--                        hiding the row, so it does not need the edge
--                        function's service-role path.
--   decide_actions   -- audit trail for every "pick" and "ask" the
--                        decide-action edge function processes: what was
--                        chosen, which Paperclip issue(s) it was relayed to,
--                        and whether a merge (if any) actually succeeded.
--                        Read-only from the browser, written only by that
--                        function on the service-role key -- same shape as
--                        paperclip_pending_items/briefs above.
--
-- Written to be re-runnable: this project takes migrations from both this
-- repo and Lovable's own agent, so every statement here must tolerate being
-- applied twice.

create table if not exists public.decide_snoozes (
  id text primary key,
  snoozed_until timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.decide_actions (
  id uuid primary key default gen_random_uuid(),
  row_id text not null,
  title text not null,
  task_ids text[] not null default '{}',
  action text not null check (action in ('pick', 'ask')),
  option_chosen text,
  action_type text,
  question text,
  status text not null default 'done' check (status in ('done', 'failed', 'needs_confirm')),
  result jsonb,
  acted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists decide_actions_row_idx on public.decide_actions (row_id);

alter table public.decide_snoozes enable row level security;
alter table public.decide_actions enable row level security;

drop policy if exists "admin read decide_snoozes" on public.decide_snoozes;
create policy "admin read decide_snoozes" on public.decide_snoozes for select
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));
drop policy if exists "admin write decide_snoozes" on public.decide_snoozes;
create policy "admin write decide_snoozes" on public.decide_snoozes for all
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));

drop policy if exists "admin read decide_actions" on public.decide_actions;
create policy "admin read decide_actions" on public.decide_actions for select
  using (exists (select 1 from public.admin_users au where au.user_id = auth.uid()));
