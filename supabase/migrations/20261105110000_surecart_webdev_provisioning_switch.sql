-- CRE-828: a switch for who provisions a Web Development purchase.
--
-- The Client Portal plugin now creates the client, the project and the 50-task
-- Web Dev backlog on a SureCart payment. This column decides whether `/admin`
-- keeps doing it too.
--
-- It ships `true` -- the behaviour that is live today -- so applying this
-- migration and deploying the function changes nothing. The cutover is one
-- UPDATE, and so is the way back; neither needs a redeploy.

alter table public.app_settings
  add column if not exists surecart_webdev_provisioning_enabled boolean not null default true;

comment on column public.app_settings.surecart_webdev_provisioning_enabled is
  'CRE-828: when false, surecart-webhook stops creating the client/project/backlog for the Web Development product and leaves it to the Client Portal plugin. Flip to false only once a test purchase has shown the plugin doing it.';

-- The singleton row predates this column, so the default only reaches it via
-- the ALTER above. Insert it when it is somehow absent rather than assuming.
insert into public.app_settings (id)
values (1)
on conflict (id) do nothing;
