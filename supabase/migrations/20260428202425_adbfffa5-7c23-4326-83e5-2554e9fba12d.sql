
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS kickoff_webhook_fired_at timestamptz,
  ADD COLUMN IF NOT EXISTS kickoff_webhook_confirmed_at timestamptz;

CREATE OR REPLACE FUNCTION public.fire_kickoff_webhook(_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  fn_url text := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/trigger-kickoff-webhook';
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
    raise notice 'fire_kickoff_webhook failed for client %: %', _client_id, sqlerrm;
  end;
end;
$$;

CREATE OR REPLACE FUNCTION public.auto_complete_journey_node()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  total_items int;
  done_items int;
  next_node_id uuid;
  did_complete boolean := false;
  new_build_start date;
  cur_build_start date;
  cur_delivery date;
  contract_done boolean := false;
  onboarding_done boolean := false;
  accounts_done boolean := false;
  gating_all_done boolean := false;
  gating_was_all_done boolean := false;
  kickoff_done boolean := false;
  non_kickoff_total int := 0;
  non_kickoff_done int := 0;
  webhook_already_fired timestamptz;
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

  if new.key = 'intake' then
    select
      bool_or(item->>'key' = 'intake.contract_signed'      and (item->>'done')::boolean),
      bool_or(item->>'key' = 'intake.onboarding_completed' and (item->>'done')::boolean),
      bool_or(item->>'key' = 'intake.accounts_submitted'   and (item->>'done')::boolean)
    into contract_done, onboarding_done, accounts_done
    from jsonb_array_elements(new.checklist) item;

    gating_all_done := coalesce(contract_done,false)
                   and coalesce(onboarding_done,false)
                   and coalesce(accounts_done,false);

    select
      coalesce(bool_or(item->>'key' = 'intake.contract_signed'      and (item->>'done')::boolean), false)
      and coalesce(bool_or(item->>'key' = 'intake.onboarding_completed' and (item->>'done')::boolean), false)
      and coalesce(bool_or(item->>'key' = 'intake.accounts_submitted'   and (item->>'done')::boolean), false)
    into gating_was_all_done
    from jsonb_array_elements(coalesce(old.checklist, '[]'::jsonb)) item;

    select build_start_date, delivery_date
      into cur_build_start, cur_delivery
      from public.clients
      where id = new.client_id;

    if gating_all_done and not gating_was_all_done then
      new_build_start := ((now() at time zone 'America/New_York')::date) + 1;
      update public.clients
        set build_start_date = new_build_start,
            delivery_date = new_build_start + 8
        where id = new.client_id;
    elsif not gating_all_done and gating_was_all_done then
      update public.clients
        set build_start_date = null,
            delivery_date = null
        where id = new.client_id;
    end if;

    -- Kickoff webhook gating: fire when ALL non-kickoff items are done,
    -- the kickoff item itself is NOT done, and we haven't fired before.
    select
      count(*) filter (where item->>'key' <> 'intake.kickoff_confirmation_sent'),
      count(*) filter (
        where item->>'key' <> 'intake.kickoff_confirmation_sent'
          and coalesce((item->>'done')::boolean, false) = true
      ),
      coalesce(bool_or(item->>'key' = 'intake.kickoff_confirmation_sent'
                       and coalesce((item->>'done')::boolean, false) = true), false)
    into non_kickoff_total, non_kickoff_done, kickoff_done
    from jsonb_array_elements(new.checklist) item;

    if non_kickoff_total > 0
       and non_kickoff_done = non_kickoff_total
       and not kickoff_done then
      select kickoff_webhook_fired_at
        into webhook_already_fired
        from public.clients
        where id = new.client_id;
      if webhook_already_fired is null then
        perform public.fire_kickoff_webhook(new.client_id);
      end if;
    end if;
  end if;

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
