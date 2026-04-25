create table public.surecontact_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  recipient_email text,
  client_id uuid references public.clients(id) on delete set null,
  campaign_id text,
  campaign_name text,
  message_id text,
  url text,
  ip_address text,
  user_agent text,
  occurred_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index surecontact_events_client_id_created_at_idx
  on public.surecontact_events (client_id, created_at desc);

create index surecontact_events_recipient_email_idx
  on public.surecontact_events (lower(recipient_email));

create index surecontact_events_event_type_idx
  on public.surecontact_events (event_type);

alter table public.surecontact_events enable row level security;

create policy "Admins can view surecontact events"
  on public.surecontact_events
  for select
  to authenticated
  using (public.is_admin(auth.uid()));
