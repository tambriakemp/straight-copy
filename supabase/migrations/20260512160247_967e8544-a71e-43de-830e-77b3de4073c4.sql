-- Proposals (App Development project type)
CREATE TABLE public.client_proposals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL,
  client_project_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  source_pdf_path text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  client_signature_name text,
  client_signature_type text,
  client_signature_data text,
  client_signed_at timestamptz,
  client_ip text,
  client_user_agent text,
  client_audit jsonb,
  agency_signer_name text NOT NULL DEFAULT 'Tambria Kemp',
  agency_countersigned_at timestamptz,
  signed_pdf_path text,
  pdf_generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_proposals_status_chk CHECK (status IN ('draft','sent','signed','voided')),
  CONSTRAINT client_proposals_sig_type_chk CHECK (client_signature_type IS NULL OR client_signature_type IN ('typed','drawn'))
);

CREATE INDEX idx_client_proposals_client ON public.client_proposals(client_id);
CREATE INDEX idx_client_proposals_project ON public.client_proposals(client_project_id);

ALTER TABLE public.client_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage proposals"
  ON public.client_proposals FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Service role manages proposals"
  ON public.client_proposals FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER trg_client_proposals_updated_at
  BEFORE UPDATE ON public.client_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Reserve a journey scaffold for the new tier so future stages can hang off it
INSERT INTO public.journey_templates (tier, order_index, key, label, description, checklist)
VALUES ('app_development', 0, 'app_dev.intake', 'Project intake', 'Initial intake for app development engagement', '[]'::jsonb)
ON CONFLICT DO NOTHING;