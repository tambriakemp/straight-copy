-- Onboarding submissions table
CREATE TABLE public.onboarding_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_name TEXT,
  contact_email TEXT,
  contact_name TEXT,
  conversation JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.onboarding_submissions ENABLE ROW LEVEL SECURITY;

-- Public can insert their own onboarding (no auth required for onboarding flow)
CREATE POLICY "Anyone can submit onboarding"
ON public.onboarding_submissions
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only service role can read submissions (for owner review via backend)
CREATE POLICY "Service role can read submissions"
ON public.onboarding_submissions
FOR SELECT
TO public
USING (auth.role() = 'service_role');

CREATE POLICY "Service role can update submissions"
ON public.onboarding_submissions
FOR UPDATE
TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Updated_at trigger function (reuse if exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_onboarding_submissions_updated_at
BEFORE UPDATE ON public.onboarding_submissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();