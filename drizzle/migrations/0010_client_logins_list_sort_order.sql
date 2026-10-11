create or replace view public.client_logins_list as
select id, client_id, label, url, username, note, created_at, updated_at,
       (encrypted_password is not null) as has_password,
       sort_order
from public.client_logins;

grant select on public.client_logins_list to authenticated;
revoke select (encrypted_password) on public.client_logins from authenticated;