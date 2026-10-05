-- CRE-249: fire_kickoff_webhook and fire_surecontact_sync both sent the
-- public anon key as their Authorization header. The anon key is shipped in
-- every browser bundle, so that header proved nothing about the caller —
-- anyone who could reach the function URL with a real clientId could trigger
-- a real SureContact send. Switch both to the same shared-secret pattern
-- fire_agent_dispatch already uses (x-agent-secret from Vault), reusing its
-- existing vault secret so no new one-time setup is required: the value in
-- agent_dispatch_secret is already the live CLAUDE_WEBHOOK_SECRET.
--
-- The edge functions (trigger-kickoff-webhook, sync-client-to-surecontact)
-- now check this secret via _shared/webhook-auth.ts's resolveCaller, which
-- also still accepts an authenticated admin session — unaffected by this
-- migration.

create or replace function public.fire_kickoff_webhook(_client_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  fn_url text := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/trigger-kickoff-webhook';
  secret text;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'agent_dispatch_secret'
  limit 1;

  if secret is null then
    raise notice 'fire_kickoff_webhook skipped for client %: vault secret agent_dispatch_secret is not set', _client_id;
    return;
  end if;

  begin
    perform net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-agent-secret', secret
      ),
      body := jsonb_build_object('clientId', _client_id)
    );
  exception when others then
    raise notice 'fire_kickoff_webhook failed for client %: %', _client_id, sqlerrm;
  end;
end;
$$;

create or replace function public.fire_surecontact_sync(_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url text := 'https://zjxvcgcuukgqawczanud.supabase.co/functions/v1/sync-client-to-surecontact';
  secret text;
begin
  select decrypted_secret into secret
  from vault.decrypted_secrets
  where name = 'agent_dispatch_secret'
  limit 1;

  if secret is null then
    raise notice 'fire_surecontact_sync skipped for client %: vault secret agent_dispatch_secret is not set', _client_id;
    return;
  end if;

  begin
    perform net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-agent-secret', secret
      ),
      body := jsonb_build_object('clientId', _client_id)
    );
  exception when others then
    raise notice 'fire_surecontact_sync failed for client %: %', _client_id, sqlerrm;
  end;
end;
$$;
