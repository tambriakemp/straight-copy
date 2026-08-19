-- Seed the three live ventures plus the Take the Keys launch checklist template.
-- public_ingest_key is generated here; rotate it from the Ventures settings tab
-- if it ever leaks (it appears in client-side funnel tracking code).

INSERT INTO public.ventures (slug, name, kind, platform, currency, description, funnel_stages, public_ingest_key)
VALUES
  (
    'take-the-keys', 'Take the Keys', 'training', 'stripe', 'usd',
    'Paid live training, one cohort per month, sold through a launch funnel.',
    '[{"key":"visit","label":"Landing page visit"},
      {"key":"optin","label":"Opted in"},
      {"key":"registered","label":"Registered"},
      {"key":"paid","label":"Paid"},
      {"key":"attended","label":"Attended"}]'::jsonb,
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  ),
  (
    'substack', 'Substack', 'newsletter', 'substack', 'usd',
    'Paid newsletter community. Substack bills members directly; revenue arrives as payouts and is tracked with periodic snapshots.',
    '[{"key":"visit","label":"Publication visit"},
      {"key":"free_sub","label":"Free subscriber"},
      {"key":"paid_sub","label":"Paid subscriber"}]'::jsonb,
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  ),
  (
    'skool', 'Skool', 'community', 'skool', 'usd',
    'Paid Skool community. Skool bills members directly; tracked with periodic snapshots.',
    '[{"key":"visit","label":"Group page visit"},
      {"key":"applied","label":"Applied"},
      {"key":"member","label":"Paid member"}]'::jsonb,
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  )
ON CONFLICT (slug) DO NOTHING;

-- Take the Keys runs the same sequence every month. offset_days is relative to
-- the launch start date, so each new cohort gets real due dates automatically.
INSERT INTO public.launch_checklist_templates (venture_id, key, label, description, order_index, offset_days)
SELECT v.id, t.key, t.label, t.description, t.order_index, t.offset_days
FROM public.ventures v
CROSS JOIN (VALUES
  ('topic',         'Lock topic & promise',        'Decide the session topic and the outcome attendees walk away with.', 1, -21),
  ('sales_page',    'Sales page live',             'Landing page published with date, price and checkout link.',          2, -18),
  ('checkout',      'Stripe checkout ready',       'Payment link created with launch_id set in checkout metadata.',       3, -18),
  ('promo_content', 'Promo content scheduled',     'Social posts and emails queued for the open window.',                 4, -14),
  ('cart_open',     'Cart open',                   'Open enrollment and announce.',                                       5, -14),
  ('reminder_1',    'Reminder email #1',           'Mid-window nudge to the list.',                                       6,  -7),
  ('reminder_2',    'Last call email',             'Final push before cart close.',                                       7,  -2),
  ('cart_close',    'Cart close',                  'Close enrollment.',                                                   8,  -1),
  ('prep',          'Session prep & slides',       'Deck finished, run of show written, tech checked.',                   9,  -1),
  ('deliver',       'Deliver live session',        'Run the training.',                                                  10,   0),
  ('replay',        'Send replay & resources',     'Recording plus any workbooks out to attendees.',                     11,   1),
  ('debrief',       'Debrief & log numbers',       'Record actual revenue, attendance and what to change next cycle.',   12,   3)
) AS t(key, label, description, order_index, offset_days)
WHERE v.slug = 'take-the-keys'
ON CONFLICT (venture_id, key) DO NOTHING;
