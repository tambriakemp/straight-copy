
-- Activity events feed for admin dashboard
CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL,
  title text NOT NULL,
  description text,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  client_project_id uuid REFERENCES public.client_projects(id) ON DELETE SET NULL,
  actor text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_events_occurred_at ON public.activity_events(occurred_at DESC);
CREATE INDEX idx_activity_events_kind ON public.activity_events(kind);
CREATE INDEX idx_activity_events_client ON public.activity_events(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_events TO authenticated;
GRANT ALL ON public.activity_events TO service_role;

ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read activity_events" ON public.activity_events
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins manage activity_events" ON public.activity_events
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Service role manages activity_events" ON public.activity_events
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Trigger: log contract signed
CREATE OR REPLACE FUNCTION public.log_contract_signed_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  SELECT coalesce(business_name, contact_name, 'Client') INTO v_name FROM public.clients WHERE id = NEW.client_id;
  INSERT INTO public.activity_events(kind, title, description, client_id, client_project_id, actor, metadata)
  VALUES (
    'contract_signed',
    v_name || ' signed contract',
    'Tier: ' || NEW.tier,
    NEW.client_id, NEW.client_project_id, NEW.client_signature_name,
    jsonb_build_object('contract_id', NEW.id, 'tier', NEW.tier)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_contract_signed ON public.client_contracts;
CREATE TRIGGER trg_log_contract_signed AFTER INSERT ON public.client_contracts
  FOR EACH ROW EXECUTE FUNCTION public.log_contract_signed_activity();

-- Trigger: log preview approval
CREATE OR REPLACE FUNCTION public.log_preview_approval_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client_id uuid; v_project uuid; v_name text;
BEGIN
  SELECT pp.client_id, cp.id INTO v_client_id, v_project
    FROM public.preview_projects pp
    LEFT JOIN public.client_projects cp ON cp.client_id = pp.client_id
   WHERE pp.id = NEW.project_id LIMIT 1;
  SELECT coalesce(business_name, contact_name, 'Client') INTO v_name FROM public.clients WHERE id = v_client_id;
  INSERT INTO public.activity_events(kind, title, description, client_id, client_project_id, actor, metadata)
  VALUES (
    'preview_approved',
    coalesce(v_name, 'Client') || ' approved ' || NEW.kind || ' ' || NEW.path,
    NULL, v_client_id, v_project, NEW.approver_name,
    jsonb_build_object('preview_project_id', NEW.project_id, 'path', NEW.path, 'kind', NEW.kind)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_preview_approval ON public.preview_approvals;
CREATE TRIGGER trg_log_preview_approval AFTER INSERT ON public.preview_approvals
  FOR EACH ROW EXECUTE FUNCTION public.log_preview_approval_activity();

-- Trigger: log proposal signed
CREATE OR REPLACE FUNCTION public.log_proposal_signed_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  IF NEW.status = 'signed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'signed') THEN
    SELECT coalesce(business_name, contact_name, 'Client') INTO v_name FROM public.clients WHERE id = NEW.client_id;
    INSERT INTO public.activity_events(kind, title, description, client_id, client_project_id, actor, metadata)
    VALUES (
      'proposal_signed',
      v_name || ' signed proposal',
      NEW.title, NEW.client_id, NEW.client_project_id, NEW.client_signature_name,
      jsonb_build_object('proposal_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_proposal_signed ON public.client_proposals;
CREATE TRIGGER trg_log_proposal_signed AFTER INSERT OR UPDATE ON public.client_proposals
  FOR EACH ROW EXECUTE FUNCTION public.log_proposal_signed_activity();

-- Trigger: log invoice paid
CREATE OR REPLACE FUNCTION public.log_invoice_paid_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    SELECT coalesce(business_name, contact_name, 'Client') INTO v_name FROM public.clients WHERE id = NEW.client_id;
    INSERT INTO public.activity_events(kind, title, description, client_id, client_project_id, metadata)
    VALUES (
      'invoice_paid',
      v_name || ' paid invoice',
      NEW.label || ' — $' || (NEW.amount_cents/100.0)::text,
      NEW.client_id, NEW.client_project_id,
      jsonb_build_object('invoice_id', NEW.id, 'amount_cents', NEW.amount_cents)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_invoice_paid ON public.project_invoices;
CREATE TRIGGER trg_log_invoice_paid AFTER INSERT OR UPDATE ON public.project_invoices
  FOR EACH ROW EXECUTE FUNCTION public.log_invoice_paid_activity();

-- Trigger: log new client
CREATE OR REPLACE FUNCTION public.log_client_created_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.activity_events(kind, title, description, client_id, metadata)
  VALUES (
    'client_created',
    'New client: ' || coalesce(NEW.business_name, NEW.contact_name, 'Untitled'),
    NEW.contact_email,
    NEW.id,
    jsonb_build_object('tier', NEW.tier)
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_client_created ON public.clients;
CREATE TRIGGER trg_log_client_created AFTER INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.log_client_created_activity();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events;
