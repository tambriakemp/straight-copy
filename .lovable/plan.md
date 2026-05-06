## Goal
When a SureCart Launch/Growth purchase results in a new client (via the onboarding completion trigger), automatically create an `automation_build` project under that client and seed its journey nodes from the matching tier template — without bringing back the unwanted "auto-create on every client insert" behavior that we just removed for manual client creation.

## Why a plain trigger won't do
We deliberately dropped `clients_seed_journey` so that admins clicking "+ New Client" on the dashboard get an empty client with no projects. We need a way to distinguish "client born from a paid onboarding" from "client created manually by an admin."

The clean signal we already have: `clients.onboarding_submission_id is not null` means the row came from `create_client_from_onboarding`. Manual admin inserts leave that null.

## Changes

### 1. New migration: seed-on-onboarding trigger
Create a dedicated trigger that fires only on the onboarding path, not on every client insert.

```sql
create or replace function public.seed_project_from_onboarding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj_id uuid;
begin
  -- Only act when the row was created from an onboarding submission and has a tier
  if new.onboarding_submission_id is null then return new; end if;
  if new.tier is null then return new; end if;

  -- Idempotency: skip if an automation_build project already exists for this client
  if exists (
    select 1 from public.client_projects
     where client_id = new.id and type = 'automation_build'
  ) then
    return new;
  end if;

  insert into public.client_projects (client_id, type, name, status)
  values (
    new.id,
    'automation_build',
    coalesce(nullif(new.business_name,'') || ' — ' || initcap(new.tier) || ' build',
             initcap(new.tier) || ' build'),
    'active'
  )
  returning id into proj_id;

  insert into public.journey_nodes
    (client_id, client_project_id, template_id, key, label, order_index, checklist)
  select new.id, proj_id, t.id, t.key, t.label, t.order_index, t.checklist
    from public.journey_templates t
   where t.tier = new.tier
  on conflict (client_id, key) do nothing;

  return new;
end;
$$;

drop trigger if exists clients_seed_project_from_onboarding on public.clients;
create trigger clients_seed_project_from_onboarding
after insert on public.clients
for each row
execute function public.seed_project_from_onboarding();
```

Notes:
- `AFTER INSERT` only — manual admin inserts (no `onboarding_submission_id`) are skipped.
- Idempotent — re-running or future webhook retries won't double-seed.
- Also covers the existing-client path: `create_client_from_onboarding` UPDATEs an existing client when it matches by subscription/email, so we should also fire on UPDATE when `onboarding_submission_id` transitions from NULL → not-NULL. Add a second `AFTER UPDATE OF onboarding_submission_id` trigger that calls the same function (the idempotency guard makes this safe).

### 2. One-time backfill in the same migration
For any existing clients that already came from onboarding but have no automation_build project (e.g. clients created in the window after we dropped the seed trigger), seed them now:

```sql
do $$
declare r record; proj_id uuid;
begin
  for r in
    select c.* from public.clients c
    where c.onboarding_submission_id is not null
      and c.tier is not null
      and not exists (
        select 1 from public.client_projects p
         where p.client_id = c.id and p.type = 'automation_build'
      )
  loop
    insert into public.client_projects (client_id, type, name, status)
    values (r.id, 'automation_build',
            coalesce(nullif(r.business_name,'') || ' — ' || initcap(r.tier) || ' build',
                     initcap(r.tier) || ' build'),
            'active')
    returning id into proj_id;

    insert into public.journey_nodes
      (client_id, client_project_id, template_id, key, label, order_index, checklist)
    select r.id, proj_id, t.id, t.key, t.label, t.order_index, t.checklist
      from public.journey_templates t
     where t.tier = r.tier
    on conflict (client_id, key) do nothing;
  end loop;
end $$;
```

### 3. No code changes needed elsewhere
- `surecart-webhook` already sets the right `tier` on the invite and on the client (when matching by email).
- `create_client_from_onboarding` already copies `tier` from the invite onto the new client.
- `ClientDetail` "+ New Project" flow still works for adding additional projects later; its seeding stays unchanged.

## Verification steps after deploy
1. Pick an existing onboarding-created client with no project; confirm the backfill created one and the journey nodes match the tier.
2. Simulate a new SureCart paid order against a test email, complete onboarding, and confirm the resulting client has exactly one `automation_build` project plus journey nodes.
3. Click "+ New Client" from the dashboard and confirm it still creates an empty client with zero projects (manual path unaffected).

## Files touched
- New: `supabase/migrations/<ts>_seed_project_from_onboarding.sql` (function + 2 triggers + backfill)
- No edits to edge functions or React code.
