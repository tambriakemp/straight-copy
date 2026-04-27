-- 1. Update journey_templates so future clients get the new shape.
update public.journey_templates
set checklist = '[
  {"key":"intake.welcome_email_sent","label":"Welcome email sent via SureContact","owner":"auto","done":false},
  {"key":"intake.scope_summary_sent","label":"Scope summary email sent to client","owner":"auto","done":false},
  {"key":"intake.welcome_opened","label":"Welcome email opened","owner":"auto","done":false},
  {"key":"intake.kickoff_confirmation_sent","label":"Kickoff confirmation email sent via SureContact","owner":"auto","done":false},
  {"key":"intake.portal_accessed","label":"Portal accessed","owner":"client","done":false},
  {"key":"intake.contract_signed","label":"Contract signed","owner":"client","done":false},
  {"key":"intake.onboarding_completed","label":"Onboarding chat completed","owner":"client","auto_key":"onboarding_completed","done":false},
  {"key":"intake.accounts_submitted","label":"Required accounts created and access submitted via portal","owner":"client","auto_key":"accounts_submitted","done":false},
  {"key":"intake.contract_countersigned","label":"Contract countersigned","owner":"agency","done":false},
  {"key":"intake.summary_reviewed","label":"Intake summary reviewed and quality confirmed","owner":"agency","done":false},
  {"key":"intake.social_audit","label":"Baseline social audit completed if client has existing accounts","owner":"agency","done":false}
]'::jsonb
where key = 'intake';

-- 2. For each existing intake node, rebuild the checklist preserving prior `done` state,
--    then auto-flip items where tracking timestamps already exist.
with old_done as (
  select
    jn.id as node_id,
    jn.client_id,
    coalesce(jsonb_object_agg(item->>'key', (item->>'done')::boolean) filter (where item ? 'key'), '{}'::jsonb) as done_map
  from public.journey_nodes jn
  cross join lateral jsonb_array_elements(coalesce(jn.checklist, '[]'::jsonb)) item
  where jn.key = 'intake'
  group by jn.id, jn.client_id
)
update public.journey_nodes jn
set checklist = (
  select jsonb_agg(
    case t.key
      when 'intake.welcome_email_sent' then jsonb_build_object('key', t.key, 'label', t.label, 'owner', t.owner, 'done', coalesce((cet.welcome_sent_at is not null), coalesce((od.done_map->>t.key)::boolean, false)))
      when 'intake.scope_summary_sent' then jsonb_build_object('key', t.key, 'label', t.label, 'owner', t.owner, 'done', coalesce((cet.scope_sent_at is not null), coalesce((od.done_map->>t.key)::boolean, false)))
      when 'intake.welcome_opened' then jsonb_build_object('key', t.key, 'label', t.label, 'owner', t.owner, 'done', coalesce((cet.welcome_opened_at is not null), false))
      when 'intake.kickoff_confirmation_sent' then jsonb_build_object('key', t.key, 'label', t.label, 'owner', t.owner, 'done', coalesce((cet.kickoff_sent_at is not null), coalesce((od.done_map->>t.key)::boolean, false)))
      when 'intake.portal_accessed' then jsonb_build_object('key', t.key, 'label', t.label, 'owner', t.owner, 'done', false)
      when 'intake.onboarding_completed' then jsonb_build_object('key', t.key, 'label', t.label, 'owner', t.owner, 'auto_key', 'onboarding_completed', 'done', coalesce((od.done_map->>t.key)::boolean, false))
      when 'intake.accounts_submitted' then jsonb_build_object('key', t.key, 'label', t.label, 'owner', t.owner, 'auto_key', 'accounts_submitted', 'done', coalesce((od.done_map->>t.key)::boolean, false))
      else jsonb_build_object('key', t.key, 'label', t.label, 'owner', t.owner, 'done', coalesce((od.done_map->>t.key)::boolean, false))
    end
    order by t.ord
  )
  from (values
    ('intake.welcome_email_sent', 'Welcome email sent via SureContact', 'auto', 1),
    ('intake.scope_summary_sent', 'Scope summary email sent to client', 'auto', 2),
    ('intake.welcome_opened', 'Welcome email opened', 'auto', 3),
    ('intake.kickoff_confirmation_sent', 'Kickoff confirmation email sent via SureContact', 'auto', 4),
    ('intake.portal_accessed', 'Portal accessed', 'client', 5),
    ('intake.contract_signed', 'Contract signed', 'client', 6),
    ('intake.onboarding_completed', 'Onboarding chat completed', 'client', 7),
    ('intake.accounts_submitted', 'Required accounts created and access submitted via portal', 'client', 8),
    ('intake.contract_countersigned', 'Contract countersigned', 'agency', 9),
    ('intake.summary_reviewed', 'Intake summary reviewed and quality confirmed', 'agency', 10),
    ('intake.social_audit', 'Baseline social audit completed if client has existing accounts', 'agency', 11)
  ) as t(key, label, owner, ord)
  left join old_done od on od.node_id = jn.id
  left join public.client_email_tracking cet on cet.client_id = jn.client_id
)
where jn.key = 'intake';
