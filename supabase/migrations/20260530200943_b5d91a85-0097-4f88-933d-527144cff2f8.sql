-- Auto-trigger Brain Artifact generation when the brain_setup journey node
-- transitions to in_progress. Fire-and-forget via pg_net; failures don't
-- block the source operation.

CREATE OR REPLACE FUNCTION public.fire_brain_artifacts_generation(_client_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/generate-brain-artifacts';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqeHZjZ2N1dWtncWF3Y3phbnVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NDQyMDEsImV4cCI6MjA5MTUyMDIwMX0.NoraGciOY8UjOvGarwCfQaZXtoBSBjRBzc-4t2PWCU4';
BEGIN
  BEGIN
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key
      ),
      body := jsonb_build_object('clientProjectId', _client_project_id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'fire_brain_artifacts_generation failed for project %: %', _client_project_id, sqlerrm;
  END;
END;
$$;

-- Trigger on journey_nodes: fire when brain_setup transitions to in_progress.
CREATE OR REPLACE FUNCTION public.trg_brain_setup_in_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.key = 'brain_setup'
     AND NEW.status = 'in_progress'
     AND COALESCE(OLD.status, '') <> 'in_progress'
     AND NEW.client_project_id IS NOT NULL
  THEN
    PERFORM public.fire_brain_artifacts_generation(NEW.client_project_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS brain_setup_in_progress_fire ON public.journey_nodes;
CREATE TRIGGER brain_setup_in_progress_fire
AFTER UPDATE OF status ON public.journey_nodes
FOR EACH ROW EXECUTE FUNCTION public.trg_brain_setup_in_progress();