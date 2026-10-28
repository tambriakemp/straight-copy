-- CRE-780: onboarding-chat had verify_jwt=false and no caller check at all
-- (not even the per-IP rate limit save-onboarding already has) — every turn
-- calls Anthropic directly, so an open endpoint can run up real cost.
-- This table backs a per-IP sliding-window limit inside the function itself.
-- Service-role only; no anon/authenticated grant needed, it's pure
-- bookkeeping the edge function reads and writes with its own client.
--
-- Idempotent: this database takes migrations from this repo and from
-- Lovable's own agent.
CREATE TABLE IF NOT EXISTS public.onboarding_chat_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_chat_requests_ip_created
  ON public.onboarding_chat_requests (ip, created_at);

ALTER TABLE public.onboarding_chat_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages onboarding_chat_requests" ON public.onboarding_chat_requests;
CREATE POLICY "Service role manages onboarding_chat_requests"
  ON public.onboarding_chat_requests FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');