# Add OAuth 2.1 to the Project Tasks MCP server

Goal: make the MCP endpoint connectable from claude.ai's "Custom connector" UI (no Claude Desktop / `mcp-remote` needed) by implementing the OAuth flow Claude expects.

## What Claude.ai expects

When you paste a remote MCP URL into claude.ai, it:

1. Hits `/.well-known/oauth-protected-resource` on the MCP host to discover the auth server.
2. Hits `/.well-known/oauth-authorization-server` to discover endpoints.
3. POSTs to `/register` (Dynamic Client Registration, RFC 7591) to get a `client_id`.
4. Redirects the user's browser to `/authorize` with PKCE.
5. After consent, redirects back to Claude with a `code`.
6. POSTs `code + code_verifier` to `/token`, gets an `access_token`.
7. Calls the MCP endpoint with `Authorization: Bearer <access_token>`.

## Architecture

One new edge function `mcp-oauth` handles all OAuth endpoints. The existing `project-tasks-mcp` function is updated to accept OAuth bearer tokens (in addition to the existing static API tokens, so Claude Desktop setups keep working).

```text
claude.ai  ──►  /functions/v1/mcp-oauth/.well-known/oauth-authorization-server
              /functions/v1/mcp-oauth/register
              /functions/v1/mcp-oauth/authorize   ──► consent page (admin login)
              /functions/v1/mcp-oauth/token
              /functions/v1/project-tasks-mcp     (validates OAuth or API token)
```

## Database

New tables (all admin-only, service-role accessed):

- `mcp_oauth_clients` — dynamically registered Claude clients (`client_id`, `client_name`, `redirect_uris[]`, `created_at`).
- `mcp_oauth_codes` — short-lived auth codes (`code`, `client_id`, `redirect_uri`, `code_challenge`, `code_challenge_method`, `user_id`, `scope`, `expires_at`).
- `mcp_oauth_tokens` — issued access tokens (`token_hash`, `client_id`, `user_id`, `scope`, `expires_at`, `revoked`).

All RLS-locked to admins only; the edge function uses the service role.

## Consent / login page

`/authorize` renders a minimal HTML page (server-rendered from the edge function) that:

- Shows "Claude is requesting access to your Project Tasks".
- Requires the user to sign in with their existing admin Supabase account (email + password form, posted back to the same function).
- On success, generates the auth code and 302s back to Claude's `redirect_uri`.

Non-admins are rejected (checked via `has_role(user, 'admin')`).

## MCP endpoint changes

`checkToken` in `project-tasks-mcp/index.ts` is extended:

1. If the bearer matches a row in `api_tokens` → allow (current behavior).
2. Else hash and look up in `mcp_oauth_tokens`; if found, not revoked, not expired → allow.
3. Else 401 with `WWW-Authenticate: Bearer resource_metadata="<…/.well-known/oauth-protected-resource>"` so Claude knows where to start the flow.

Also add `/.well-known/oauth-protected-resource` to the MCP function pointing at the new auth server.

## UI changes

Small addition to `/admin/tokens`: a section listing connected Claude clients and active OAuth sessions, with a "Revoke" button per token. No new page needed.

## User flow after this ships

1. In claude.ai → Settings → Connectors → Add custom connector.
2. Paste `https://<project>.supabase.co/functions/v1/project-tasks-mcp`.
3. Claude opens our consent page in a popup → user signs in with their admin email/password → approves.
4. Connector becomes active; tools appear in Claude's chat.

## Files

New:
- `supabase/migrations/<ts>_mcp_oauth.sql` — three tables + RLS + grants.
- `supabase/functions/mcp-oauth/index.ts` — discovery, register, authorize (GET+POST), token, plus consent HTML.

Edited:
- `supabase/functions/project-tasks-mcp/index.ts` — dual token validation + `WWW-Authenticate` + resource metadata route.
- `src/pages/admin/TokensView.tsx` (or wherever `/admin/tokens` lives) — small "Claude OAuth sessions" panel.

## Notes / scope limits

- Refresh tokens omitted in v1; access tokens last 30 days, Claude can just re-auth.
- Only the `admin` role can complete the consent step.
- The existing static-bearer flow keeps working, so nothing breaks for Claude Desktop users.
