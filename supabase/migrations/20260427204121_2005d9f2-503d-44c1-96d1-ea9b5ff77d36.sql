
-- Extensions for scheduled HTTP calls
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Tracking state on clients
alter table public.clients
  add column if not exists email_tracking_last_polled_at timestamptz,
  add column if not exists email_tracking_complete_at timestamptz,
  add column if not exists email_tracking_paused_at timestamptz,
  add column if not exists email_tracking_paused_reason text;

create index if not exists idx_clients_email_tracking_eligibility
  on public.clients (email_tracking_last_polled_at)
  where archived = false
    and email_tracking_complete_at is null
    and email_tracking_paused_at is null;

-- Per-client email tracking cache (one row per client)
create table if not exists public.client_email_tracking (
  client_id uuid primary key references public.clients(id) on delete cascade,
  welcome_sent_at timestamptz,
  welcome_opened_at timestamptz,
  scope_sent_at timestamptz,
  scope_opened_at timestamptz,
  kickoff_sent_at timestamptz,
  kickoff_opened_at timestamptz,
  day3_sent_at timestamptz,
  day3_opened_at timestamptz,
  delivery_sent_at timestamptz,
  delivery_opened_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.client_email_tracking enable row level security;

drop policy if exists "Admins read client_email_tracking" on public.client_email_tracking;
create policy "Admins read client_email_tracking"
  on public.client_email_tracking
  for select
  to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists "Service role manages client_email_tracking" on public.client_email_tracking;
create policy "Service role manages client_email_tracking"
  on public.client_email_tracking
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Auto-pause tracking when client is archived or subscription canceled
create or replace function public.auto_pause_email_tracking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    -- Newly archived
    if coalesce(new.archived, false) = true and coalesce(old.archived, false) = false
       and new.email_tracking_paused_at is null then
      new.email_tracking_paused_at := now();
      new.email_tracking_paused_reason := 'archived';
    end if;

    -- Subscription canceled
    if coalesce(new.subscription_status, '') = 'canceled'
       and coalesce(old.subscription_status, '') is distinct from 'canceled'
       and new.email_tracking_paused_at is null then
      new.email_tracking_paused_at := now();
      new.email_tracking_paused_reason := 'subscription_canceled';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_auto_pause_email_tracking on public.clients;
create trigger trg_clients_auto_pause_email_tracking
  before update on public.clients
  for each row
  execute function public.auto_pause_email_tracking();
