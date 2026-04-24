
-- 1) Drop stage columns from clients
ALTER TABLE public.clients DROP COLUMN IF EXISTS stage;
ALTER TABLE public.clients DROP COLUMN IF EXISTS stage_order;

-- 2) Add purchased_at for "days since onboarding"
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS purchased_at timestamptz;
UPDATE public.clients SET purchased_at = created_at WHERE purchased_at IS NULL;

-- 3) Templates table
CREATE TABLE IF NOT EXISTS public.journey_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier text NOT NULL,
  order_index int NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier, order_index),
  UNIQUE (tier, key)
);

ALTER TABLE public.journey_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read templates"
  ON public.journey_templates FOR SELECT
  USING (true);

CREATE POLICY "Admins manage templates"
  ON public.journey_templates FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role manages templates"
  ON public.journey_templates FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4) Per-client nodes
CREATE TABLE IF NOT EXISTS public.journey_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.journey_templates(id) ON DELETE SET NULL,
  key text NOT NULL,
  label text NOT NULL,
  order_index int NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','complete')),
  notes text,
  asset_url text,
  asset_label text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, key)
);

CREATE INDEX IF NOT EXISTS journey_nodes_client_idx ON public.journey_nodes (client_id, order_index);

ALTER TABLE public.journey_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage journey nodes"
  ON public.journey_nodes FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role manages journey nodes"
  ON public.journey_nodes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER set_journey_nodes_updated_at
  BEFORE UPDATE ON public.journey_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Auto-stamp started_at / completed_at on status change
CREATE OR REPLACE FUNCTION public.stamp_journey_node_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'in_progress' AND NEW.started_at IS NULL THEN
    NEW.started_at = now();
  END IF;
  IF NEW.status = 'complete' AND NEW.completed_at IS NULL THEN
    NEW.completed_at = now();
    IF NEW.started_at IS NULL THEN NEW.started_at = now(); END IF;
  END IF;
  IF NEW.status = 'pending' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER journey_nodes_status_stamp
  BEFORE INSERT OR UPDATE OF status ON public.journey_nodes
  FOR EACH ROW EXECUTE FUNCTION public.stamp_journey_node_status();

-- 6) Seed templates
INSERT INTO public.journey_templates (tier, order_index, key, label, description) VALUES
  ('launch', 0, 'intake',       'Intake',        'Onboarding chat completed'),
  ('launch', 1, 'brand_voice',  'Brand Voice',   'Brand voice document drafted'),
  ('launch', 2, 'automation_01','Automation 01', 'First automation built'),
  ('launch', 3, 'automation_02','Automation 02', 'Second automation built'),
  ('launch', 4, 'delivery',     'Delivery',      'Hand-off and walkthrough'),
  ('launch', 5, 'active',       'Active',        'Client is live')
ON CONFLICT (tier, key) DO NOTHING;

INSERT INTO public.journey_templates (tier, order_index, key, label, description) VALUES
  ('growth', 0, 'intake',         'Intake',         'Onboarding chat completed'),
  ('growth', 1, 'brand_voice',    'Brand Voice',    'Brand voice document drafted'),
  ('growth', 2, 'brand_kit',      'Brand Kit',      'Visual brand kit assembled'),
  ('growth', 3, 'brain_setup',    'Brain Setup',    'Business Brain knowledge base loaded'),
  ('growth', 4, 'avatar',         'Avatar',         'Customer avatar finalised'),
  ('growth', 5, 'automation_01',  'Automation 01',  'First automation built'),
  ('growth', 6, 'automation_02',  'Automation 02',  'Second automation built'),
  ('growth', 7, 'content_system', 'Content System', 'Content publishing system live'),
  ('growth', 8, 'delivery',       'Delivery',       'Hand-off and walkthrough'),
  ('growth', 9, 'active',         'Active',         'Client is live')
ON CONFLICT (tier, key) DO NOTHING;

-- 7) Trigger: seed journey nodes when a client is created
CREATE OR REPLACE FUNCTION public.seed_journey_nodes_for_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.journey_nodes (client_id, template_id, key, label, order_index)
  SELECT NEW.id, t.id, t.key, t.label, t.order_index
  FROM public.journey_templates t
  WHERE t.tier = NEW.tier
  ON CONFLICT (client_id, key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_seed_journey ON public.clients;
CREATE TRIGGER clients_seed_journey
  AFTER INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.seed_journey_nodes_for_client();

-- 8) If a client's tier changes after creation, fill in any missing nodes for the new tier.
CREATE OR REPLACE FUNCTION public.sync_journey_nodes_on_tier_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tier IS DISTINCT FROM OLD.tier THEN
    INSERT INTO public.journey_nodes (client_id, template_id, key, label, order_index)
    SELECT NEW.id, t.id, t.key, t.label, t.order_index
    FROM public.journey_templates t
    WHERE t.tier = NEW.tier
    ON CONFLICT (client_id, key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_sync_journey_on_tier ON public.clients;
CREATE TRIGGER clients_sync_journey_on_tier
  AFTER UPDATE OF tier ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.sync_journey_nodes_on_tier_change();

-- 9) Backfill nodes for any pre-existing clients
INSERT INTO public.journey_nodes (client_id, template_id, key, label, order_index)
SELECT c.id, t.id, t.key, t.label, t.order_index
FROM public.clients c
JOIN public.journey_templates t ON t.tier = c.tier
ON CONFLICT (client_id, key) DO NOTHING;
