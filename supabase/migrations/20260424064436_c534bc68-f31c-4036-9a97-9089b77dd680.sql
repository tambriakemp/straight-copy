-- New onboarding_invites table
CREATE TABLE public.onboarding_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  contact_name text,
  contact_email text,
  business_name text,
  note text,
  expires_at timestamptz,
  created_by uuid,
  submission_id uuid,
  last_opened_at timestamptz,
  completed_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_onboarding_invites_token ON public.onboarding_invites(token);
CREATE INDEX idx_onboarding_invites_submission ON public.onboarding_invites(submission_id);

ALTER TABLE public.onboarding_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage invites"
  ON public.onboarding_invites
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Service role manages invites"
  ON public.onboarding_invites
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_onboarding_invites_updated_at
  BEFORE UPDATE ON public.onboarding_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Extend onboarding_submissions
ALTER TABLE public.onboarding_submissions
  ADD COLUMN invite_id uuid,
  ADD COLUMN last_activity_at timestamptz;

CREATE INDEX idx_onboarding_submissions_invite ON public.onboarding_submissions(invite_id);