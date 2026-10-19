// Shared caller-authorization for internal webhooks, cron targets, and
// admin-triggered edge functions. CRE-249 found several of these trusting an
// opaque id (projectId, clientId) with no check on who sent it — anyone who
// could guess or read the id could fire the action. Three caller shapes cover
// every legitimate case in this codebase:
//
//   - "secret": a DB trigger or pg_cron job proving itself with the
//     CLAUDE_WEBHOOK_SECRET shared secret — same pattern as agent-run,
//     dispatch-agent-runs, and dispatch-social-schedule already use.
//   - "service_role": another edge function calling server-to-server, whose
//     Supabase client already attaches the project's service-role key.
//   - "admin": a logged-in user whose id is in admin_users, checked through
//     the existing is_admin RPC (the same gate the admin dashboard itself
//     relies on).
//
// Anything else — including a request that only carries the public anon
// key, which ships in every browser bundle and proves nothing — resolves to
// "unauthorized".
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

export type Caller =
  | { kind: "secret" }
  | { kind: "service_role" }
  | { kind: "admin"; userId: string }
  | { kind: "unauthorized" };

function suppliedSecret(req: Request): string | null {
  return req.headers.get("x-agent-secret") ?? new URL(req.url).searchParams.get("secret");
}

/** True when the request carries the CLAUDE_WEBHOOK_SECRET shared secret. */
export function hasAgentSecret(req: Request): boolean {
  const secret = Deno.env.get("CLAUDE_WEBHOOK_SECRET");
  const supplied = suppliedSecret(req);
  return !!secret && !!supplied && supplied === secret;
}

/**
 * Resolves who is actually calling. Never throws — a missing or malformed
 * Authorization header resolves to "unauthorized" rather than an error.
 */
export async function resolveCaller(req: Request): Promise<Caller> {
  if (hasAgentSecret(req)) return { kind: "secret" };

  const auth = req.headers.get("Authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!bearer) return { kind: "unauthorized" };

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && bearer === serviceKey) return { kind: "service_role" };

  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth! } } },
    );
    const { data, error } = await userClient.auth.getUser(bearer);
    if (error || !data?.user) return { kind: "unauthorized" };

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey!);
    const { data: isAdmin } = await sb.rpc("is_admin", { _user_id: data.user.id });
    return isAdmin ? { kind: "admin", userId: data.user.id } : { kind: "unauthorized" };
  } catch {
    return { kind: "unauthorized" };
  }
}

// CRE-536: the client portal (/portal/:clientId) trusted the :clientId in
// the URL as its only proof of who was asking — same bug class as the
// admin-triggered functions above, just on the client-facing side. Every
// portal edge function now resolves the caller against a real Supabase
// Auth session before trusting the clientId its own request body names.
export type PortalCaller =
  | { kind: "portal"; userId: string; clientId: string }
  | { kind: "admin"; userId: string }
  | { kind: "unauthorized" };

/**
 * Resolves whether the caller may act on behalf of `clientId` in the
 * portal. An admin (same check as resolveCaller's "admin" kind) always
 * may — that's the existing "preview as admin" path (/portal/:id?as=admin)
 * from the client's admin page. Otherwise the bearer token's own user must
 * be an ACTIVE row in client_portal_users for exactly this clientId.
 * Never trusts clientId alone, and never accepts the anon key.
 */
export async function resolvePortalCaller(req: Request, clientId: string): Promise<PortalCaller> {
  const auth = req.headers.get("Authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!bearer || !clientId || !serviceKey) return { kind: "unauthorized" };
  // The anon key proves nothing — reject it outright rather than letting
  // auth.getUser() on it resolve to "no user" further down for free.
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (anonKey && bearer === anonKey) return { kind: "unauthorized" };

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const { data, error } = await sb.auth.getUser(bearer);
    if (error || !data?.user) return { kind: "unauthorized" };
    const userId = data.user.id;

    const { data: isAdmin } = await sb.rpc("is_admin", { _user_id: userId });
    if (isAdmin) return { kind: "admin", userId };

    const { data: member } = await sb
      .from("client_portal_users")
      .select("id")
      .eq("user_id", userId)
      .eq("client_id", clientId)
      .eq("status", "active")
      .maybeSingle();
    if (member) return { kind: "portal", userId, clientId };

    return { kind: "unauthorized" };
  } catch {
    return { kind: "unauthorized" };
  }
}
