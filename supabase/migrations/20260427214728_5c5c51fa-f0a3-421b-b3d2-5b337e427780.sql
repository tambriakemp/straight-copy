-- Move build_start_date / delivery_date stamping out of full-node completion.
-- They should be set the moment the 3 client gating items are all done:
--   intake.contract_signed, intake.onboarding_completed, intake.accounts_submitted
-- And cleared if any of those becomes unchecked again.

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

  -- Gating items for build/delivery dates (intake node only)
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

    -- Was it all done before this update?
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
      -- Just transitioned to all-done — stamp dates from today (EST + 1)
      new_build_start := ((now() at time zone 'America/New_York')::date) + 1;
      update public.clients
        set build_start_date = new_build_start,
            delivery_date = new_build_start + 8
        where id = new.client_id;
    elsif not gating_all_done and gating_was_all_done then
      -- A gating item was unchecked — clear dates
      update public.clients
        set build_start_date = null,
            delivery_date = null
        where id = new.client_id;
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