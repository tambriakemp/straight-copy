-- Meeting links become a per-agent, per-purpose setting, and the questions the
-- engagement manager kept asking become standing rules with answers.
-- Idempotent throughout.

-- ---------------------------------------------------------------------------
-- 1. meeting_link -> proposal_meeting_link.
--
--    An agent has more than one kind of conversation to offer. A single
--    `meeting_link` forced every agent's every context through one URL, so the
--    key now names what the meeting is FOR. Anything matching *_meeting_link is
--    surfaced in agent settings, so a new purpose is a new key, not a migration.
-- ---------------------------------------------------------------------------
UPDATE public.agents
   SET config = (config - 'meeting_link')
       || jsonb_build_object(
            'proposal_meeting_link',
            'https://app.surecontact.com/book/22a527cf-904b-4c22-baf1-2c933c51916c/proposal-discussion'
          )
 WHERE key = 'client-engagement';

-- Every other agent keeps whatever it had, just under the new name.
UPDATE public.agents
   SET config = (config - 'meeting_link')
       || jsonb_build_object('proposal_meeting_link', config->>'meeting_link')
 WHERE key <> 'client-engagement'
   AND config ? 'meeting_link'
   AND COALESCE(config->>'meeting_link', '') <> '';

UPDATE public.agents
   SET config = config - 'meeting_link'
 WHERE config ? 'meeting_link';

-- ---------------------------------------------------------------------------
-- 2. The questions she kept asking, answered once.
--
--    Each of these has an obvious professional default. Asking about them made
--    a proposal request into an interview, so they are settled here where they
--    can be read, edited and switched off rather than buried in a prompt.
-- ---------------------------------------------------------------------------
INSERT INTO public.agent_rules (scope, agent_id, label, body, category, order_index)
SELECT 'agent', a.id, v.label, v.body, v.category, v.order_index
FROM public.agents a
CROSS JOIN (VALUES
  ('Legal entity and signer',
   'The company name in the CRM is the legal entity name. The named contact is the signer; if no title is recorded, use the one their role implies. Where there is an email and no name, read the name from the address. Put your best version on the acceptance page and list it as an assumption — never leave it blank and never ask.',
   'general', 110),
  ('Phase names',
   'Every engagement has three phases, retainers included. Default to Foundation, Momentum, Growth for retainers and Discovery & Design, Build, Launch & Handover for builds. Rename them to fit the work; do not ask which to use.',
   'process', 120),
  ('Billing date and late payment',
   'Retainers bill on the 1st. Build installments bill on signature, at the midpoint, and on delivery. Payment is net 7. Work pauses on an invoice more than 14 days late. Never ask about any of this.',
   'pricing', 130),
  ('AI and tooling costs',
   'When a client agrees to cover ad spend or "any additional costs", that includes AI running costs, API usage and third-party tooling. Say so plainly in the pass-through line rather than asking whether it counts.',
   'pricing', 140),
  ('Scope depth',
   'Where a service could be scoped shallow or deep — ASO iterations, ad variants, article length — pick the depth the budget supports, state it as a monthly deliverable, and note that it flexes with performance. Do not ask the owner to specify volumes she has not raised.',
   'general', 150),
  ('The thesis is yours to propose',
   'Derive the strategic thesis from the scope and assert it. Offer it as the argument you are making, not as a question. If she disagrees she will say so in one line.',
   'voice', 160),
  ('Proposal meeting link',
   'When a client has questions about a proposal, offer the proposal discussion booking link from your settings. Never invent a booking URL.',
   'general', 170)
) AS v(label, body, category, order_index)
WHERE a.key = 'client-engagement'
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_rules r
    WHERE r.agent_id = a.id AND r.label = v.label
  );
