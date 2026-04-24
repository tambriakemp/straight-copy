
CREATE OR REPLACE FUNCTION public.stamp_journey_node_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'in_progress' AND NEW.started_at IS NULL THEN
    NEW.started_at = now();
  END IF;
  IF NEW.status = 'complete' AND NEW.completed_at IS NULL THEN
    NEW.completed_at = now();
    IF NEW.started_at IS NULL THEN NEW.started_at = now(); END IF;
  END IF;
  IF NEW.status = 'pending' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;
