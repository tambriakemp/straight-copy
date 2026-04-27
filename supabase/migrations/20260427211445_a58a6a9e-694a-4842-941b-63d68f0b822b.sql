-- 1) Safeguard trigger: if a node's checklist no longer fully done, reopen it and reset downstream
CREATE OR REPLACE FUNCTION public.auto_reopen_journey_node()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  total_items int;
  done_items int;
begin
  total_items := jsonb_array_length(coalesce(new.checklist, '[]'::jsonb));
  if total_items = 0 then
    return new;
  end if;

  select count(*) into done_items
  from jsonb_array_elements(new.checklist) item
  where coalesce((item->>'done')::boolean, false) = true;

  if done_items < total_items and new.status = 'complete' then
    new.status := 'in_progress';
    new.completed_at := null;
    if new.started_at is null then
      new.started_at := now();
    end if;
  end if;

  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_auto_reopen_journey_node ON public.journey_nodes;
CREATE TRIGGER trg_auto_reopen_journey_node
BEFORE UPDATE OF checklist ON public.journey_nodes
FOR EACH ROW
EXECUTE FUNCTION public.auto_reopen_journey_node();

-- After a reopen, push later nodes back to pending
CREATE OR REPLACE FUNCTION public.cascade_reset_downstream_nodes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if old.status = 'complete' and new.status <> 'complete' then
    update public.journey_nodes
       set status = 'pending',
           started_at = null,
           completed_at = null
     where client_id = new.client_id
       and order_index > new.order_index
       and status in ('in_progress','complete','client_submitted');
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_cascade_reset_downstream_nodes ON public.journey_nodes;
CREATE TRIGGER trg_cascade_reset_downstream_nodes
AFTER UPDATE OF status ON public.journey_nodes
FOR EACH ROW
EXECUTE FUNCTION public.cascade_reset_downstream_nodes();

-- 2) Reset bad data: force done=false on auto/client items + intake.contract_countersigned
WITH reset AS (
  SELECT
    n.id,
    (
      SELECT jsonb_agg(
        CASE
          WHEN coalesce(item->>'owner','') IN ('auto','client')
            OR (n.key = 'intake' AND coalesce(item->>'key','') = 'contract_countersigned')
          THEN jsonb_set(item, '{done}', 'false'::jsonb, true)
          ELSE item
        END
        ORDER BY ord
      )
      FROM jsonb_array_elements(n.checklist) WITH ORDINALITY arr(item, ord)
    ) AS new_checklist
  FROM public.journey_nodes n
  WHERE jsonb_array_length(coalesce(n.checklist, '[]'::jsonb)) > 0
)
UPDATE public.journey_nodes n
SET checklist = r.new_checklist
FROM reset r
WHERE n.id = r.id
  AND r.new_checklist IS NOT NULL
  AND n.checklist IS DISTINCT FROM r.new_checklist;