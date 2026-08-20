-- Standing rules an agent reads before every run, and multiple-choice questions
-- it can ask back. Idempotent: this database takes migrations from two sources.

-- ---------------------------------------------------------------------------
-- 1. agent_rules — the things that are always true.
--
--    These could have lived in agents.config or in the system_prompt override,
--    but both are one big blob: you cannot pause a single rule, see when one
--    was added, or tell which rule made the agent behave a certain way. A row
--    per rule makes each one a thing you can read, disable and delete on its
--    own, which is what a rule needs to be to stay trustworthy.
--
--    scope 'all' applies to every agent. Anything else names an agent key, so
--    "governing law is Georgia" can be global while "always lead with the
--    highest-leverage service" belongs to the engagement manager alone.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    uuid REFERENCES public.agents(id) ON DELETE CASCADE,
  scope       text NOT NULL DEFAULT 'agent',
  label       text NOT NULL,
  body        text NOT NULL,
  category    text NOT NULL DEFAULT 'general',
  enabled     boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_rules_scope_chk CHECK (scope IN ('all', 'agent')),
  -- A global rule has no agent; an agent rule must name one.
  CONSTRAINT agent_rules_target_chk CHECK (
    (scope = 'all' AND agent_id IS NULL) OR (scope = 'agent' AND agent_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_rules_agent
  ON public.agent_rules (agent_id, order_index) WHERE enabled;
CREATE INDEX IF NOT EXISTS idx_agent_rules_global
  ON public.agent_rules (order_index) WHERE scope = 'all' AND enabled;

ALTER TABLE public.agent_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage agent_rules" ON public.agent_rules;
CREATE POLICY "Admins manage agent_rules"
  ON public.agent_rules FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role manages agent_rules" ON public.agent_rules;
CREATE POLICY "Service role manages agent_rules"
  ON public.agent_rules FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS trg_agent_rules_updated_at ON public.agent_rules;
CREATE TRIGGER trg_agent_rules_updated_at
  BEFORE UPDATE ON public.agent_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. Multiple-choice questions on a chat message.
--
--    Stored on the message rather than in a table of their own: a question only
--    ever belongs to the turn that asked it, and answering is just sending
--    another message, so there is no state to keep beyond the render.
-- ---------------------------------------------------------------------------
ALTER TABLE public.agent_messages
  ADD COLUMN IF NOT EXISTS questions jsonb;

COMMENT ON COLUMN public.agent_messages.questions IS
  'Optional [{id, question, options:[{label, description}], multi}] rendered as choices under the reply.';

-- ---------------------------------------------------------------------------
-- 3. Seed Bree's standing rules.
--
--    Everything here is a thing the agent used to ask about every single time.
-- ---------------------------------------------------------------------------
INSERT INTO public.agent_rules (scope, agent_id, label, body, category, order_index)
SELECT 'agent', a.id, v.label, v.body, v.category, v.order_index
FROM public.agents a
CROSS JOIN (VALUES
  ('Governing law',
   'Governing law is Georgia unless the client is outside the US, in which case ask.',
   'terms', 10),
  ('Warranty',
   'Every build carries a 30-day post-launch warranty covering defects in work delivered. Never ask about this.',
   'terms', 20),
  ('Design revisions',
   'Two rounds of revisions in the design phase, one round in development, on every build. Further rounds are change orders.',
   'terms', 30),
  ('App store submission',
   'App store submission is handled by Cre8 Visions on app builds, included.',
   'terms', 40),
  ('Pass-through costs',
   'Ad spend, influencer budgets, API and AI running costs, domains and third-party subscriptions are pass-through: billed to the client at cost with no markup, stated separately from the fee. Never fold them into the retainer or the total.',
   'pricing', 50),
  ('Retainer terms',
   'Retainers are billed on the 1st, carry a 3-month minimum then run month-to-month, and cancel on 30 days written notice.',
   'pricing', 60),
  ('Onboarding and reporting',
   'Onboarding begins within 5 business days of a signed agreement and first payment. Monthly performance reports are delivered by the 5th.',
   'process', 70),
  ('Signature and contact',
   'Proposals are prepared by Cre8 Visions, contact info@cre8visions.com. The agency signer is Tambria Kemp.',
   'general', 80),
  ('Client voice',
   'All content is written in the client''s brand voice, not the agency''s. Say so in the proposal where it is relevant.',
   'voice', 90),
  ('Ask sparingly',
   'Prefer writing the proposal with stated assumptions over asking questions. One round of questions maximum, multiple choice where possible, and never ask anything these rules already answer.',
   'general', 100)
) AS v(label, body, category, order_index)
WHERE a.key = 'client-engagement'
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_rules r
    WHERE r.agent_id = a.id AND r.label = v.label
  );
