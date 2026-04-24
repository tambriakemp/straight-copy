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
        business_name, contact_name, contact_email, intake_summary,
        onboarding_submission_id, stage, tier
      ) VALUES (
        NEW.business_name, NEW.contact_name, NEW.contact_email,
        CASE WHEN NEW.summary IS NOT NULL THEN NEW.summary::text ELSE NULL END,
        NEW.id, 'intake_submitted', 'launch'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;