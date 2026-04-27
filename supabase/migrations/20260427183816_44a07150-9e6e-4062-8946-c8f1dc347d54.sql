ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS surecart_subscription_id text,
  ADD COLUMN IF NOT EXISTS surecart_customer_id text,
  ADD COLUMN IF NOT EXISTS surecart_order_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS subscription_canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS clients_surecart_subscription_id_idx
  ON public.clients (surecart_subscription_id);

CREATE INDEX IF NOT EXISTS clients_surecart_customer_id_idx
  ON public.clients (surecart_customer_id);