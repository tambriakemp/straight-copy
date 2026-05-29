
-- MCP OAuth 2.1 tables

CREATE TABLE public.mcp_oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT,
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
  grant_types TEXT[] NOT NULL DEFAULT ARRAY['authorization_code'],
  response_types TEXT[] NOT NULL DEFAULT ARRAY['code'],
  scope TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_oauth_clients TO authenticated;
GRANT ALL ON public.mcp_oauth_clients TO service_role;

ALTER TABLE public.mcp_oauth_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage oauth clients"
ON public.mcp_oauth_clients
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


CREATE TABLE public.mcp_oauth_codes (
  code TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES public.mcp_oauth_clients(client_id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL DEFAULT 'S256',
  user_id UUID NOT NULL,
  scope TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.mcp_oauth_codes TO service_role;

ALTER TABLE public.mcp_oauth_codes ENABLE ROW LEVEL SECURITY;
-- Codes are only ever touched by the edge function (service role); no user-facing policies.


CREATE TABLE public.mcp_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES public.mcp_oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  scope TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.mcp_oauth_tokens TO authenticated;
GRANT ALL ON public.mcp_oauth_tokens TO service_role;

ALTER TABLE public.mcp_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins view oauth tokens"
ON public.mcp_oauth_tokens
FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "admins revoke oauth tokens"
ON public.mcp_oauth_tokens
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX idx_mcp_oauth_tokens_hash ON public.mcp_oauth_tokens(token_hash);
CREATE INDEX idx_mcp_oauth_codes_expires ON public.mcp_oauth_codes(expires_at);
