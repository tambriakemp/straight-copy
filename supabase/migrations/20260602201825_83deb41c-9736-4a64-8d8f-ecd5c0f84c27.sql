CREATE TABLE public.web_dev_discovery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  client_project_id uuid,
  conversation jsonb NOT NULL DEFAULT '[]'::jsonb,
  completed boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX web_dev_discovery_project_unique
  ON public.web_dev_discovery (client_project_id)
  WHERE client_project_id IS NOT NULL;

CREATE INDEX web_dev_discovery_client_idx ON public.web_dev_discovery (client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_dev_discovery TO authenticated;
GRANT ALL ON public.web_dev_discovery TO service_role;

ALTER TABLE public.web_dev_discovery ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage web_dev_discovery"
  ON public.web_dev_discovery FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role manages web_dev_discovery"
  ON public.web_dev_discovery FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_web_dev_discovery_updated_at
  BEFORE UPDATE ON public.web_dev_discovery
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
