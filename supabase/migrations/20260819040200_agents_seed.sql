-- Seed the three agents.
--
-- Autonomy is set per agent rather than globally, matching how much damage each
-- one could plausibly do:
--   revenue-analyst  propose      -- read-only by nature; it only ever writes a brief
--   launch-ops       act_in_app   -- may open tasks and tick checklist items on its
--                                    own; drafted emails still wait for approval
--   client-triage    act_in_app   -- may open chase tasks; never contacts a client
--                                    without you reading the draft first
-- Cron is UTC. 12:00 UTC ~ 8am ET.

INSERT INTO public.agents (key, name, role, description, autonomy, schedule_cron, delivery, config)
VALUES
  (
    'revenue-analyst',
    'Margot',
    'Revenue & portfolio analyst',
    'Reads every revenue stream — agency invoices, venture cash, community run-rate — and writes a plain-English brief on what moved, what is at risk, and what is outstanding.',
    'propose',
    '0 12 * * 1',                                   -- Mondays 12:00 UTC
    '{"in_app":true,"email":true,"tasks":false,"push":false}'::jsonb,
    '{"lookback_days":30,"compare_to_prior_period":true}'::jsonb
  ),
  (
    'launch-ops',
    'Rune',
    'Launch & funnel operator',
    'Watches every open launch against its goal, flags the funnel stage that is lagging, keeps the cohort checklist moving, and drafts the reminder emails when the cart is closing.',
    'act_in_app',
    '0 13 * * *',                                   -- daily 13:00 UTC
    '{"in_app":true,"email":false,"tasks":true,"push":true}'::jsonb,
    '{"warn_if_behind_pct":70,"remind_days_before_close":3}'::jsonb
  ),
  (
    'client-triage',
    'Perry',
    'Client operations triage',
    'Sweeps overdue tasks, unpaid invoices, unsigned proposals and stale previews across every client, then chases what is actually chaseable.',
    'act_in_app',
    '0 12 * * 1-5',                                 -- weekdays 12:00 UTC
    '{"in_app":true,"email":true,"tasks":true,"push":false}'::jsonb,
    '{"invoice_overdue_days":7,"proposal_stale_days":5}'::jsonb
  )
ON CONFLICT (key) DO NOTHING;
