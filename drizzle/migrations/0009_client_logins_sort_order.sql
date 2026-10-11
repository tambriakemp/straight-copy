alter table public.client_logins add column if not exists sort_order integer;

with ranked as (
  select id, row_number() over (partition by client_id order by created_at) as rn
  from public.client_logins
)
update public.client_logins l
set sort_order = r.rn
from ranked r
where l.id = r.id and l.sort_order is null;

comment on column public.client_logins.sort_order is 'Display order within a client; lower sorts first. Managed by the Logins tab drag-to-reorder.';