-- Add SureCart tracking columns to onboarding_invites
ALTER TABLE public.onboarding_invites
  ADD COLUMN IF NOT EXISTS source_order_id text,
  ADD COLUMN IF NOT EXISTS tier text;

CREATE UNIQUE INDEX IF NOT EXISTS onboarding_invites_source_order_id_key
  ON public.onboarding_invites (source_order_id)
  WHERE source_order_id IS NOT NULL;

-- Update trigger to read tier from linked invite (fallback to 'launch')
CREATE OR REPLACE FUNCTION public.create_client_from_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  existing UUID;
  invite_tier TEXT;
BEGIN
  IF NEW.completed = true AND (OLD.completed IS DISTINCT FROM true) THEN
    SELECT id INTO existing FROM public.clients WHERE onboarding_submission_id = NEW.id;
    IF existing IS NULL THEN
      IF NEW.invite_id IS NOT NULL THEN
        SELECT tier INTO invite_tier FROM public.onboarding_invites WHERE id = NEW.invite_id;
      END IF;
      INSERT INTO public.clients (
        business_name, contact_name, contact_email, intake_summary,
        onboarding_submission_id, stage, tier
      ) VALUES (
        NEW.business_name, NEW.contact_name, NEW.contact_email,
        CASE WHEN NEW.summary IS NOT NULL THEN NEW.summary::text ELSE NULL END,
        NEW.id, 'intake_submitted', COALESCE(invite_tier, 'launch')
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;