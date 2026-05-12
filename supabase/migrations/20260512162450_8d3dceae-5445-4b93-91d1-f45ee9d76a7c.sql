
CREATE TABLE public.project_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  client_project_id UUID NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','sent','paid','void','failed')),
  surecart_checkout_id TEXT,
  surecart_invoice_id TEXT,
  surecart_order_id TEXT,
  checkout_url TEXT,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_project_invoices_project ON public.project_invoices (client_project_id, sequence);
CREATE INDEX idx_project_invoices_client_status ON public.project_invoices (client_id, status);
CREATE INDEX idx_project_invoices_checkout ON public.project_invoices (surecart_checkout_id) WHERE surecart_checkout_id IS NOT NULL;
CREATE INDEX idx_project_invoices_order ON public.project_invoices (surecart_order_id) WHERE surecart_order_id IS NOT NULL;

ALTER TABLE public.project_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage project_invoices"
  ON public.project_invoices
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Service role manages project_invoices"
  ON public.project_invoices
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_project_invoices_updated_at
  BEFORE UPDATE ON public.project_invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
