-- The client page's Notes and Logins tabs.
--
-- Notes are a plain table: a dated list, newest first, as the canvas draws
-- it. `clients.notes` stays where it is — it is one free-text field that
-- several other surfaces already read, and overloading it into a log would
-- have broken them.
--
-- Logins are account credentials for the client's own systems, so the
-- password is encrypted at rest with pgp_sym_encrypt, exactly the way
-- project_secrets already does it: the key never touches the database or
-- the browser, it is set per-session by an edge function holding
-- PROJECT_SECRETS_KEY. The SELECT privilege on the ciphertext column is
-- revoked from `authenticated` as well, so an admin's own PostgREST token
-- cannot ask for it even though RLS lets them read the row.
--
-- Idempotent: this database takes migrations from this repo and from
-- Lovable's agent, so assume it may already have been applied.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- 1. client_notes ----------
CREATE TABLE IF NOT EXISTS public.client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_notes_client
  ON public.client_notes(client_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_notes TO authenticated;
GRANT ALL ON public.client_notes TO service_role;

ALTER TABLE public.client_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage client_notes" ON public.client_notes;
CREATE POLICY "Admins manage client_notes"
  ON public.client_notes FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role manages client_notes" ON public.client_notes;
CREATE POLICY "Service role manages client_notes"
  ON public.client_notes FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------- 2. client_logins ----------
CREATE TABLE IF NOT EXISTS public.client_logins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label text NOT NULL,
  url text,
  username text,
  encrypted_password bytea,
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_logins_client
  ON public.client_logins(client_id, created_at);

-- Everything EXCEPT the ciphertext. Column-level, so a hand-rolled
-- PostgREST request for encrypted_password is refused rather than
-- returning base64 that only needs the key to finish the job.
GRANT SELECT (id, client_id, label, url, username, note, created_at, updated_at)
  ON public.client_logins TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.client_logins TO authenticated;
GRANT ALL ON public.client_logins TO service_role;

ALTER TABLE public.client_logins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage client_logins" ON public.client_logins;
CREATE POLICY "Admins manage client_logins"
  ON public.client_logins FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Service role manages client_logins" ON public.client_logins;
CREATE POLICY "Service role manages client_logins"
  ON public.client_logins FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- `has_password` without handing out the ciphertext: the list needs to know
-- whether to draw the dots, and nothing more.
CREATE OR REPLACE VIEW public.client_logins_list
WITH (security_invoker = true) AS
  SELECT id, client_id, label, url, username, note, created_at, updated_at,
         (encrypted_password IS NOT NULL) AS has_password
    FROM public.client_logins;

GRANT SELECT ON public.client_logins_list TO authenticated;
GRANT SELECT ON public.client_logins_list TO service_role;

-- ---------- 3. Encryption helpers (SECURITY DEFINER, server-only) ----------
-- Same contract as set_project_secret / get_project_secret: the caller
-- passes the key, the function never stores it, and EXECUTE is granted to
-- service_role only — so only an edge function holding PROJECT_SECRETS_KEY
-- can reach them.

CREATE OR REPLACE FUNCTION public.set_client_login(
  _id uuid,
  _client_id uuid,
  _label text,
  _url text,
  _username text,
  _password text,
  _note text DEFAULT NULL,
  _created_by uuid DEFAULT NULL,
  _enc_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_enc bytea; v_id uuid;
BEGIN
  IF _password IS NOT NULL AND length(_password) > 0 THEN
    IF _enc_key IS NULL OR length(_enc_key) = 0 THEN
      RAISE EXCEPTION 'encryption key required';
    END IF;
    v_enc := pgp_sym_encrypt(_password, _enc_key);
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.client_logins (client_id, label, url, username, encrypted_password, note, created_by)
      VALUES (_client_id, _label, _url, _username, v_enc, _note, _created_by)
      RETURNING id INTO v_id;
  ELSE
    UPDATE public.client_logins
       SET label = _label,
           url = _url,
           username = _username,
           -- A blank password on an edit means "leave it alone", not
           -- "clear it": the edit form never shows the current one, so
           -- submitting the form unchanged must not wipe it.
           encrypted_password = COALESCE(v_enc, encrypted_password),
           note = _note,
           updated_at = now()
     WHERE id = _id AND client_id = _client_id
     RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_login(
  _id uuid,
  _enc_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_enc bytea;
BEGIN
  IF _enc_key IS NULL OR length(_enc_key) = 0 THEN
    RAISE EXCEPTION 'encryption key required';
  END IF;
  SELECT encrypted_password INTO v_enc FROM public.client_logins WHERE id = _id;
  IF v_enc IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(v_enc, _enc_key);
END;
$$;

REVOKE ALL ON FUNCTION public.set_client_login(uuid, uuid, text, text, text, text, text, uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_client_login(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_client_login(uuid, uuid, text, text, text, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_client_login(uuid, text) TO service_role;
