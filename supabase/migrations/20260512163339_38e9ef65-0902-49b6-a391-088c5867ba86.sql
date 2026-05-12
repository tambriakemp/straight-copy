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

  -- Only surface launch/growth journey nodes in the portal.
  -- App development projects have their own portal sections (proposals, invoices)
  -- and must not advertise launch/growth nodes like Brand Kit.
  SELECT jn.id, jn.key, jn.label, jn.order_index, jn.status, jn.notes
    INTO active_node
    FROM public.journey_nodes jn
    LEFT JOIN public.client_projects cp ON cp.id = jn.client_project_id
    WHERE jn.client_id = _client_id
      AND jn.status NOT IN ('complete', 'client_submitted')
      AND (cp.id IS NULL OR cp.type <> 'app_development')
    ORDER BY jn.order_index ASC
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