-- Helper: fire-and-forget call to the sync-client-to-surecontact edge function
-- via pg_net. Failures are swallowed so they never block the source operation.
create or replace function public.fire_surecontact_sync(_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url text := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/sync-client-to-surecontact';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqeHZjZ2N1dWtncWF3Y3phbnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDQyMDEsImV4cCI6MjA5MTUyMDIwMX0.NoraGciOY8UjOvGarwCfQaZXtoBSBjRBzc-4t2PWCU4';
begin
  begin
    perform net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object('clientId', _client_id)
    );
  exception when others then
    raise notice 'fire_surecontact_sync failed for client %: %', _client_id, sqlerrm;
  end;
end;
$$;

-- Trigger on clients: sync on insert, or when tier / contact_email / business_name / contact_name changes
create or replace function public.trg_clients_surecontact_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.contact_email is not null then
      perform public.fire_surecontact_sync(new.id);
    end if;
  elsif tg_op = 'UPDATE' then
    if new.contact_email is not null and (
      coalesce(new.tier, '') is distinct from coalesce(old.tier, '')
      or coalesce(new.contact_email, '') is distinct from coalesce(old.contact_email, '')
      or coalesce(new.business_name, '') is distinct from coalesce(old.business_name, '')
      or coalesce(new.contact_name, '') is distinct from coalesce(old.contact_name, '')
      or coalesce(new.archived, false) is distinct from coalesce(old.archived, false)
    ) then
      perform public.fire_surecontact_sync(new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_surecontact_sync on public.clients;
create trigger clients_surecontact_sync
after insert or update on public.clients
for each row execute function public.trg_clients_surecontact_sync();

-- Extend auto_complete_journey_node so stage advancement also re-syncs SureContact.
-- This wraps the existing logic and adds a sync call when the node transitions to complete.
create or replace function public.auto_complete_journey_node()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  total_items int;
  done_items int;
  next_node_id uuid;
  did_complete boolean := false;
begin
  if new.checklist is not distinct from old.checklist then
    return new;
  end if;

  total_items := jsonb_array_length(coalesce(new.checklist, '[]'::jsonb));
  if total_items = 0 then
    return new;
  end if;

  select count(*) into done_items
  from jsonb_array_elements(new.checklist) item
  where coalesce((item->>'done')::boolean, false) = true;

  if done_items = total_items and new.status <> 'complete' then
    new.status := 'complete';
    new.completed_at := coalesce(new.completed_at, now());
    if new.started_at is null then new.started_at := now(); end if;
    did_complete := true;

    select id into next_node_id
    from public.journey_nodes
    where client_id = new.client_id
      and order_index > new.order_index
      and status = 'pending'
    order by order_index asc
    limit 1;

    if next_node_id is not null then
      update public.journey_nodes
      set status = 'in_progress', started_at = coalesce(started_at, now())
      where id = next_node_id;
    end if;
  end if;

  if did_complete then
    perform public.fire_surecontact_sync(new.client_id);
  end if;

  return new;
end;
$function$;