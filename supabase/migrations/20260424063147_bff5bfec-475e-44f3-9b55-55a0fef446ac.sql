-- =========================================================
-- Client Pipeline CRM schema
-- =========================================================

-- 1. admin_users table
CREATE TABLE public.admin_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- security definer function to check admin status (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = _user_id
  );
$$;

CREATE POLICY "Admins can view admin_users"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Service role manages admin_users"
  ON public.admin_users FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. clients table
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  tier TEXT NOT NULL DEFAULT 'launch' CHECK (tier IN ('launch', 'growth')),
  stage TEXT NOT NULL DEFAULT 'intake_submitted' CHECK (stage IN (
    'intake_submitted',
    'brand_voice_generation',
    'build_in_progress',
    'ready_for_review',
    'delivered',
    'active_client'
  )),
  stage_order INTEGER NOT NULL DEFAULT 0,
  intake_summary TEXT,
  brand_voice_url TEXT,
  brand_voice_content TEXT,
  onboarding_submission_id UUID REFERENCES public.onboarding_submissions(id) ON DELETE SET NULL,
  notes TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_stage ON public.clients(stage);
CREATE INDEX idx_clients_tier ON public.clients(tier);
CREATE INDEX idx_clients_archived ON public.clients(archived);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage clients"
  ON public.clients FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Service role manages clients"
  ON public.clients FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. client_checklist_items
CREATE TABLE public.client_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklist_client ON public.client_checklist_items(client_id);

ALTER TABLE public.client_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage checklist"
  ON public.client_checklist_items FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Service role manages checklist"
  ON public.client_checklist_items FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. client_automations
CREATE TABLE public.client_automations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'building', 'live', 'paused')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automations_client ON public.client_automations(client_id);

ALTER TABLE public.client_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage automations"
  ON public.client_automations FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Service role manages automations"
  ON public.client_automations FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_automations_updated_at
  BEFORE UPDATE ON public.client_automations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. client_deliveries
CREATE TABLE public.client_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  title TEXT NOT NULL,
  description TEXT,
  link_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deliveries_client ON public.client_deliveries(client_id);

ALTER TABLE public.client_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage deliveries"
  ON public.client_deliveries FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Service role manages deliveries"
  ON public.client_deliveries FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 6. api_tokens
CREATE TABLE public.api_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view api_tokens"
  ON public.api_tokens FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins insert api_tokens"
  ON public.api_tokens FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins update api_tokens"
  ON public.api_tokens FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins delete api_tokens"
  ON public.api_tokens FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Service role manages api_tokens"
  ON public.api_tokens FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 7. Trigger: auto-create client when onboarding submission marked completed
CREATE OR REPLACE FUNCTION public.create_client_from_onboarding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing UUID;
BEGIN
  IF NEW.completed = true AND (OLD.completed IS DISTINCT FROM true) THEN
    SELECT id INTO existing FROM public.clients WHERE onboarding_submission_id = NEW.id;
    IF existing IS NULL THEN
      INSERT INTO public.clients (
        business_name,
        contact_name,
        contact_email,
        intake_summary,
        onboarding_submission_id,
        stage,
        tier
      ) VALUES (
        NEW.business_name,
        NEW.contact_name,
        NEW.contact_email,
        CASE
          WHEN NEW.summary IS NOT NULL THEN NEW.summary::text
          ELSE NULL
        END,
        NEW.id,
        'intake_submitted',
        'launch'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_onboarding_to_client
  AFTER INSERT OR UPDATE ON public.onboarding_submissions
  FOR EACH ROW EXECUTE FUNCTION public.create_client_from_onboarding();

-- Backfill: create client rows for existing completed onboarding submissions
INSERT INTO public.clients (business_name, contact_name, contact_email, intake_summary, onboarding_submission_id, stage, tier)
SELECT
  os.business_name,
  os.contact_name,
  os.contact_email,
  CASE WHEN os.summary IS NOT NULL THEN os.summary::text ELSE NULL END,
  os.id,
  'intake_submitted',
  'launch'
FROM public.onboarding_submissions os
WHERE os.completed = true
  AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.onboarding_submission_id = os.id);