-- One-shot recovery for submission d02b978d that I accidentally overwrote.
-- Remove the empty client + its journey nodes; reset submission to incomplete
-- so the user's localStorage rehydrate + new "Wrap up" button can re-complete it.

DELETE FROM public.journey_nodes
 WHERE client_id = '61391bdd-5657-44d0-8149-6c75a00101e3';

DELETE FROM public.clients
 WHERE id = '61391bdd-5657-44d0-8149-6c75a00101e3';

UPDATE public.onboarding_submissions
   SET completed = false,
       summary = NULL,
       conversation = '[]'::jsonb
 WHERE id = 'd02b978d-604e-46d5-9012-7b935938a2ab';

UPDATE public.onboarding_invites
   SET completed_at = NULL,
       submission_id = NULL
 WHERE submission_id = 'd02b978d-604e-46d5-9012-7b935938a2ab'
    OR token = 'o70wj8kwr9bp2ryh8mzt';