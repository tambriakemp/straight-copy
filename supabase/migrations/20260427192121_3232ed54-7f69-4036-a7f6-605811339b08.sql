CREATE OR REPLACE FUNCTION public.trg_clients_surecontact_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.contact_email is not null then
      perform public.fire_surecontact_sync(new.id);
    end if;
  elsif tg_op = 'UPDATE' then
    if new.contact_email is not null and (
      coalesce(new.tier, '') is distinct from coalesce(old.tier, '')
      or coalesce(new.contact_email, '') is distinct from coalesce(old.contact_email, '')
      or coalesce(new.business_name, '') is distinct from coalesce(old.business_name, '')
      or coalesce(new.contact_name, '') is distinct from coalesce(old.contact_name, '')
      or coalesce(new.archived, false) is distinct from coalesce(old.archived, false)
      or new.build_start_date is distinct from old.build_start_date
      or new.delivery_date is distinct from old.delivery_date
      or coalesce(new.delivery_video_url, '') is distinct from coalesce(old.delivery_video_url, '')
      or coalesce(new.build_update_note, '') is distinct from coalesce(old.build_update_note, '')
    ) then
      perform public.fire_surecontact_sync(new.id);
    end if;
  end if;
  return new;
end;
$function$;