
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS brand_kit_intake jsonb,
  ADD COLUMN IF NOT EXISTS brand_kit_intake_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS brand_kit_conversation jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.get_portal_client(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  active_node RECORD;
  result jsonb;
BEGIN
  SELECT id, business_name, contact_name, tier, brand_kit_intake_submitted_at
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
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_client(uuid) TO anon, authenticated;
