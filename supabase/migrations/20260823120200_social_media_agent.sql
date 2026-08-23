-- Iris — the social media manager.
--
-- Idempotent: ON CONFLICT (key) DO NOTHING, so re-applying never overwrites
-- settings someone has since tuned from the UI. That is the point of keeping
-- operational settings in the row and the mission in registry.ts.

INSERT INTO public.agents (
  key, name, role, description,
  autonomy, model, effort, schedule_cron, timezone,
  delivery, config, accent_color
)
VALUES (
  'social-media',
  'Iris',
  'Social media manager',
  'Owns what goes out on clients'' social accounts. Writes captions in the client''s own brand voice, books a rolling two weeks to CoPost, chases the client when their photos run low, and picks up anything that failed.',
  -- Autonomous, because the whole point is that nobody presses a button every
  -- week. The brake is per client: a new marketing project is held at
  -- act_in_app by trg_hold_new_marketing_project until someone clears it, and
  -- draft_client_message waits for a person whatever this says.
  'autonomous',
  'claude-opus-5',
  'high',
  -- Weekdays, offset from the other five so they do not all land on one
  -- 15-minute dispatcher tick.
  '30 12 * * 1-5',
  'UTC',
  -- tasks is deliberately false: delivery.ts only ever branches on email and
  -- push, so the toggle does nothing. Task creation happens through the
  -- create_task action kind, which is where it actually works.
  '{"in_app":true,"email":true,"tasks":false,"push":true}'::jsonb,
  -- tool_loop must be set explicitly. The blanket UPDATE in
  -- 20260821000000_agent_tool_loop.sql only touched rows that existed then, and
  -- agent-run checks for `=== true`, so a new row without it silently falls
  -- back to the older report-tool path.
  '{
     "tool_loop": true,
     "posts_per_week": 5,
     "preferred_hours_utc": [14, 17, 21],
     "min_gap_hours": 6,
     "horizon_days": 14,
     "lookback_days": 14,
     "retry_after_minutes": 5,
     "notify_on_first_failure": false
   }'::jsonb,
  '#a58fb5'
)
ON CONFLICT (key) DO NOTHING;

-- Standing rules. Scoped to Iris, loaded into every run and every chat turn.
-- These are the things that would otherwise get re-litigated each run, or
-- learned the expensive way.
INSERT INTO public.agent_rules (scope, agent_id, label, body, category, order_index)
SELECT
  'agent', a.id, r.label, r.body, r.category, r.order_index
FROM public.agents a
CROSS JOIN (VALUES
  (
    'The autonomy list is the only authority',
    'A client posts unattended only if their project is named in autonomy_by_project. Never infer it from how long they have been a client, how good the last captions were, or how the previous client was set up.',
    'general', 10
  ),
  (
    'Read the brand voice first',
    'Write captions from the client''s approved brand voice. Where there is none, write plainly and factually — do not invent a personality for a business you have not been told about.',
    'writing', 20
  ),
  (
    'Hashtags',
    'Five to fifteen per post, lowercase, stored without the leading hash. Specific beats broad: three tags naming what the business actually does are worth more than fifteen generic ones.',
    'writing', 30
  ),
  (
    'Name the number when you ask for photos',
    'A request for more photos says how many days of posting are left. "You have four days left" gets acted on; "running low" does not.',
    'writing', 40
  ),
  (
    'An expired login is the client''s to fix',
    'When a failure is an expired or disconnected social account, email the client to reconnect it. Do not open a task for Bree and do not retry it — neither one moves it.',
    'general', 50
  ),
  (
    'Never chase the same failure twice',
    'Anything in still_failing has already been flagged and had a task opened at the moment it failed. Report it; do not open a second one.',
    'general', 60
  )
) AS r(label, body, category, order_index)
WHERE a.key = 'social-media'
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_rules x
     WHERE x.agent_id = a.id AND x.label = r.label
  );
