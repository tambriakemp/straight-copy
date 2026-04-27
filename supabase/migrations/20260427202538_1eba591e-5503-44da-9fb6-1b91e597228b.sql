ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS surecontact_contact_uuid text;
CREATE INDEX IF NOT EXISTS idx_clients_surecontact_contact_uuid ON public.clients(surecontact_contact_uuid);