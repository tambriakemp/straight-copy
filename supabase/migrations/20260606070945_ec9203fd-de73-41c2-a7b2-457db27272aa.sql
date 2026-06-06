
-- 1. Restrict journey_templates to admins (remove public read)
DROP POLICY IF EXISTS "Anyone can read templates" ON public.journey_templates;

-- 2. Tighten onboarding_submissions insert to require a valid, non-revoked, non-expired invite
DROP POLICY IF EXISTS "Anyone can submit onboarding" ON public.onboarding_submissions;
CREATE POLICY "Anyone can submit onboarding with valid invite"
ON public.onboarding_submissions
FOR INSERT
TO anon, authenticated
WITH CHECK (
  invite_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.onboarding_invites oi
    WHERE oi.id = invite_id
      AND oi.revoked = false
      AND (oi.expires_at IS NULL OR oi.expires_at > now())
  )
);

-- 3. Set search_path on functions that are missing it
ALTER FUNCTION public.automation_01_criteria_for(text) SET search_path = public;
ALTER FUNCTION public.brain_setup_criteria_for(text) SET search_path = public;
ALTER FUNCTION public.stamp_project_task_completion() SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public;

-- 4. Revoke EXECUTE from anon/authenticated on internal SECURITY DEFINER functions.
-- These are invoked exclusively via triggers or service_role (edge functions),
-- so removing public/anon/authenticated execute does not break app behavior.
DO $$
DECLARE
  fn record;
  internal_fns text[] := ARRAY[
    'delete_email','enqueue_email','move_to_dlq','read_email_batch',
    'get_project_secret','set_project_secret',
    'create_client_from_onboarding','seed_project_from_onboarding','seed_journey_nodes_for_client',
    'fire_kickoff_webhook','fire_surecontact_sync','fire_automation_01_build','fire_brain_artifacts_generation',
    'log_email_event_for_clients_tasks',
    'ensure_automation_01_tasks_for_project','ensure_brain_setup_tasks_for_project',
    'ensure_brand_kit_tasks_for_project','ensure_brand_voice_tasks_for_project',
    'ensure_intake_tasks_for_project','ensure_intake_tasks_on_node_insert','ensure_stage_tasks_on_node_insert',
    'advance_automation_01_in_progress','advance_next_epic_on_completion',
    'auto_complete_journey_node','auto_pause_email_tracking','auto_reopen_journey_node',
    'cascade_reset_downstream_nodes','stamp_journey_node_status','log_project_task_status_activity',
    'sync_automation_01_journey_from_task','sync_automation_01_tasks_from_journey',
    'sync_brain_setup_journey_from_task','sync_brain_setup_tasks_from_journey'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(internal_fns)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   fn.proname, fn.args);
  END LOOP;
END $$;
