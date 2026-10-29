-- One decrypted password, scoped to the client who owns the row.
--
-- `get_client_login` decrypts by id alone. The portal must not call it: an
-- id from another client's row would come back in clear. This function
-- returns the plaintext only when `id` and `client_id` name the same row,
-- and NULL both when the row is missing and when it has no password, so
-- those two cases are not distinguishable from the ciphertext.
--
-- EXECUTE is service_role only, same contract as get_client_login. The
-- edge function holds PROJECT_SECRETS_KEY and is the only caller. It writes
-- an `activity_events` row before it returns the value to the browser.

CREATE OR REPLACE FUNCTION public.reveal_client_login(
  _id uuid,
  _client_id uuid,
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
  IF _client_id IS NULL THEN
    RAISE EXCEPTION 'client required';
  END IF;

  SELECT encrypted_password INTO v_enc
    FROM public.client_logins
   WHERE id = _id
     AND client_id = _client_id;

  IF NOT FOUND OR v_enc IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN pgp_sym_decrypt(v_enc, _enc_key);
END;
$$;

REVOKE ALL ON FUNCTION public.reveal_client_login(uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_client_login(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.reveal_client_login(uuid, uuid, text) IS
  'Decrypt one client_logins password when the row belongs to _client_id. Service role only. NULL if the row is missing, belongs to someone else, or has no password.';
