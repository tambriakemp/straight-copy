create or replace function public.seed_project_from_onboarding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  proj_id uuid;
begin
  if new.onboarding_submission_id is null then return new; end if;
  if new.tier is null then return new; end if;

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

drop trigger if exists clients_seed_project_from_onboarding_ins on public.clients;
create trigger clients_seed_project_from_onboarding_ins
after insert on public.clients
for each row
execute function public.seed_project_from_onboarding();

drop trigger if exists clients_seed_project_from_onboarding_upd on public.clients;
create trigger clients_seed_project_from_onboarding_upd
after update of onboarding_submission_id on public.clients
for each row
when (old.onboarding_submission_id is null and new.onboarding_submission_id is not null)
execute function public.seed_project_from_onboarding();

-- Backfill
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