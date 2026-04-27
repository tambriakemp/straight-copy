-- Add build/delivery tracking + new custom fields to clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS build_start_date date,
  ADD COLUMN IF NOT EXISTS delivery_date date,
  ADD COLUMN IF NOT EXISTS delivery_video_url text,
  ADD COLUMN IF NOT EXISTS build_update_note text;

-- Replace auto_complete_journey_node:
--   * still completes nodes when checklist is fully done
--   * still advances to next pending node
--   * still re-syncs SureContact
--   NEW:
--   * when the intake node completes -> set build_start_date = (next day, EST)
--     and delivery_date = build_start_date + 8 days, only if not already set
CREATE OR REPLACE FUNCTION public.auto_complete_journey_node()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  total_items int;
  done_items int;
  next_node_id uuid;
  did_complete boolean := false;
  new_build_start date;
  cur_build_start date;
  cur_delivery date;
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

    -- Intake completion: stamp build_start_date (next day EST) + delivery_date (+8 days)
    if new.key = 'intake' then
      select build_start_date, delivery_date
        into cur_build_start, cur_delivery
        from public.clients
        where id = new.client_id;

      if cur_build_start is null then
        new_build_start := ((now() at time zone 'America/New_York')::date) + 1;
        update public.clients
          set build_start_date = new_build_start,
              delivery_date = coalesce(cur_delivery, new_build_start + 8)
          where id = new.client_id;
      elsif cur_delivery is null then
        update public.clients
          set delivery_date = cur_build_start + 8
          where id = new.client_id;
      end if;
    end if;

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

-- Update get_portal_client to surface new fields to the client portal
CREATE OR REPLACE FUNCTION public.get_portal_client(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  c RECORD;
  active_node RECORD;
  result jsonb;
BEGIN
  SELECT id, business_name, contact_name, tier, brand_kit_intake_submitted_at,
         build_start_date, delivery_date, delivery_video_url
    INTO c
    FROM public.clients
    WHERE id = _client_id AND archived = false
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT id, key, label, order_index, status, notes
    INTO active_node
    FROM public.journey_nodes
    WHERE client_id = _client_id
      AND status NOT IN ('complete', 'client_submitted')
    ORDER BY order_index ASC
    LIMIT 1;

  result := jsonb_build_object(
    'id', c.id,
    'business_name', c.business_name,
    'contact_name', c.contact_name,
    'tier', c.tier,
    'brand_kit_intake_submitted_at', c.brand_kit_intake_submitted_at,
    'build_start_date', c.build_start_date,
    'delivery_date', c.delivery_date,
    'delivery_video_url', c.delivery_video_url,
    'active_node', CASE WHEN active_node.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', active_node.id,
      'key', active_node.key,
      'label', active_node.label,
      'order_index', active_node.order_index,
      'status', active_node.status
    ) END
  );

  RETURN result;
END;
$function$;