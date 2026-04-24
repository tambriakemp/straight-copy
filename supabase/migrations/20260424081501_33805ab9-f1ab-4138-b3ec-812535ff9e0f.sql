-- Additive only: new columns on clients to support brand-voice generation pipeline.
-- Keeps existing schema, RLS, journey_nodes, invites, dashboards, and SureCart flow untouched.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS brand_voice_doc TEXT,
  ADD COLUMN IF NOT EXISTS brand_voice_quick_ref TEXT,
  ADD COLUMN IF NOT EXISTS brand_voice_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS brand_voice_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS brand_voice_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS brand_voice_error TEXT,
  ADD COLUMN IF NOT EXISTS brand_voice_approved BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS brand_voice_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'intake_submitted',
  ADD COLUMN IF NOT EXISTS intake_data JSONB;

-- Validation trigger to keep status values clean (not a CHECK constraint, per project guidelines).
CREATE OR REPLACE FUNCTION public.validate_client_brand_voice_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.brand_voice_status NOT IN ('pending','in_progress','complete','failed') THEN
    RAISE EXCEPTION 'Invalid brand_voice_status: %', NEW.brand_voice_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_validate_brand_voice_status ON public.clients;
CREATE TRIGGER clients_validate_brand_voice_status
  BEFORE INSERT OR UPDATE OF brand_voice_status ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.validate_client_brand_voice_status();

CREATE INDEX IF NOT EXISTS clients_pipeline_stage_idx ON public.clients(pipeline_stage);
CREATE INDEX IF NOT EXISTS clients_brand_voice_status_idx ON public.clients(brand_voice_status);