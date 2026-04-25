CREATE TABLE public.client_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tier TEXT NOT NULL,
  template_version TEXT NOT NULL,
  client_signature_name TEXT NOT NULL,
  client_signature_type TEXT NOT NULL CHECK (client_signature_type IN ('typed','drawn')),
  client_signature_data TEXT NOT NULL,
  client_signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_ip TEXT,
  client_user_agent TEXT,
  agency_signer_name TEXT NOT NULL DEFAULT 'Tambria Kemp',
  agency_countersigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  pdf_path TEXT,
  pdf_url TEXT,
  pdf_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_contracts_client_id ON public.client_contracts(client_id);

ALTER TABLE public.client_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage contracts"
  ON public.client_contracts
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Service role manages contracts"
  ON public.client_contracts
  FOR ALL
  USING (auth.role() = 'service_role'::text)
  WITH CHECK (auth.role() = 'service_role'::text);

CREATE TRIGGER update_client_contracts_updated_at
  BEFORE UPDATE ON public.client_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();