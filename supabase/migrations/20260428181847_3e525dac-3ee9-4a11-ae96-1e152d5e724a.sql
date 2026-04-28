-- 1. Patch the trigger to dedupe on invite_id, then contact_email
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
    -- Already linked?
    SELECT id INTO existing FROM public.clients WHERE onboarding_submission_id = NEW.id LIMIT 1;

    -- Try to match an existing client by invite tracking IDs first
    IF existing IS NULL AND NEW.invite_id IS NOT NULL THEN
      SELECT tier, surecart_subscription_id, surecart_customer_id, source_order_id
        INTO invite_tier, invite_sub_id, invite_cust_id, invite_order_id
        FROM public.onboarding_invites WHERE id = NEW.invite_id;

      IF invite_sub_id IS NOT NULL THEN
        SELECT id INTO existing FROM public.clients
          WHERE surecart_subscription_id = invite_sub_id
          ORDER BY created_at ASC LIMIT 1;
      END IF;
    END IF;

    -- Fall back to matching by contact_email (most recent unarchived client)
    IF existing IS NULL AND NEW.contact_email IS NOT NULL THEN
      SELECT id INTO existing FROM public.clients
        WHERE lower(contact_email) = lower(NEW.contact_email)
          AND archived = false
          AND onboarding_submission_id IS NULL
        ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF existing IS NOT NULL THEN
      -- Attach the submission to the existing client
      UPDATE public.clients
        SET onboarding_submission_id = NEW.id,
            intake_summary = COALESCE(intake_summary,
              CASE WHEN NEW.summary IS NOT NULL THEN NEW.summary::text ELSE NULL END),
            business_name = COALESCE(business_name, NEW.business_name),
            contact_name = COALESCE(contact_name, NEW.contact_name),
            updated_at = now()
        WHERE id = existing;
    ELSE
      -- No match — create a new client
      INSERT INTO public.clients (
        business_name, contact_name, contact_email, intake_summary,
        onboarding_submission_id, pipeline_stage, tier,
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

-- 2. Recover the existing duplicate: relink to the original client and delete the orphan
DO $$
DECLARE
  orig_id UUID := 'fec80a29-3b01-4313-8336-c32ea067ad52';
  dup_id  UUID := 'cfb808e9-60e0-4166-b9a4-e1e80d6ab0d2';
  sub_id  UUID := '6a488408-7d28-45f6-9849-750b343705fa';
  new_checklist JSONB;
BEGIN
  -- Move the submission link to the original client
  UPDATE public.clients
    SET onboarding_submission_id = sub_id,
        intake_summary = COALESCE(intake_summary, (SELECT summary::text FROM public.onboarding_submissions WHERE id = sub_id)),
        updated_at = now()
    WHERE id = orig_id;

  -- Flip intake.onboarding_completed on the original client's intake node
  SELECT jsonb_agg(
    CASE WHEN item->>'key' = 'intake.onboarding_completed'
      THEN jsonb_set(item, '{done}', 'true'::jsonb)
      ELSE item
    END
  )
  INTO new_checklist
  FROM public.journey_nodes,
       jsonb_array_elements(checklist) item
  WHERE client_id = orig_id AND key = 'intake';

  UPDATE public.journey_nodes
    SET checklist = new_checklist
    WHERE client_id = orig_id AND key = 'intake';

  -- Delete the duplicate client and its journey nodes
  DELETE FROM public.journey_nodes WHERE client_id = dup_id;
  DELETE FROM public.clients WHERE id = dup_id;
END $$;