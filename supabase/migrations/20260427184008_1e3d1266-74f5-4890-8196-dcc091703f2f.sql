ALTER TABLE public.onboarding_invites
  ADD COLUMN IF NOT EXISTS surecart_subscription_id text,
  ADD COLUMN IF NOT EXISTS surecart_customer_id text;

CREATE OR REPLACE FUNCTION public.create_client_from_onboarding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  existing UUID;
  invite_tier TEXT;
  invite_sub_id TEXT;
  invite_cust_id TEXT;
  invite_order_id TEXT;
BEGIN
  IF NEW.completed = true AND (OLD.completed IS DISTINCT FROM true) THEN
    SELECT id INTO existing FROM public.clients WHERE onboarding_submission_id = NEW.id;
    IF existing IS NULL THEN
      IF NEW.invite_id IS NOT NULL THEN
        SELECT tier, surecart_subscription_id, surecart_customer_id, source_order_id
          INTO invite_tier, invite_sub_id, invite_cust_id, invite_order_id
          FROM public.onboarding_invites WHERE id = NEW.invite_id;
      END IF;
      INSERT INTO public.clients (
        business_name, contact_name, contact_email, intake_summary,
        onboarding_submission_id, stage, tier,
        surecart_subscription_id, surecart_customer_id, surecart_order_id,
        subscription_status
      ) VALUES (
        NEW.business_name, NEW.contact_name, NEW.contact_email,
        CASE WHEN NEW.summary IS NOT NULL THEN NEW.summary::text ELSE NULL END,
        NEW.id, 'intake_submitted', COALESCE(invite_tier, 'launch'),
        invite_sub_id, invite_cust_id, invite_order_id,
        CASE WHEN invite_sub_id IS NOT NULL THEN 'active' ELSE NULL END
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;