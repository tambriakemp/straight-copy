-- 1) client_contacts table
CREATE TABLE public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text,
  email text,
  phone text,
  role text,
  is_primary boolean NOT NULL DEFAULT false,
  surecontact_contact_uuid text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contacts TO authenticated;
GRANT ALL ON public.client_contacts TO service_role;

ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage client_contacts"
  ON public.client_contacts FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role manages client_contacts"
  ON public.client_contacts FOR ALL TO public
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX client_contacts_client_id_idx ON public.client_contacts(client_id);
CREATE UNIQUE INDEX client_contacts_one_primary_per_client
  ON public.client_contacts(client_id) WHERE is_primary;

CREATE TRIGGER trg_client_contacts_updated_at
  BEFORE UPDATE ON public.client_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill existing primary contact from clients
INSERT INTO public.client_contacts (client_id, name, email, phone, is_primary, surecontact_contact_uuid)
SELECT id, contact_name, contact_email, contact_phone, true, surecontact_contact_uuid
FROM public.clients
WHERE contact_email IS NOT NULL AND contact_email <> '';

-- 2) app_settings single-row table
CREATE TABLE public.app_settings (
  id integer PRIMARY KEY DEFAULT 1,
  review_email_template_uuid text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = 1)
);

GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read app_settings"
  ON public.app_settings FOR SELECT TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins update app_settings"
  ON public.app_settings FOR UPDATE TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role manages app_settings"
  ON public.app_settings FOR ALL TO public
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;