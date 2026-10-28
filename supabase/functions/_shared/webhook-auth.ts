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
import {
  VIEW_AS_HEADER,
  functionNameFromUrl,
  verifyViewAsToken,
  viewAsMayRead,
  type ViewAsClaims,
  type ViewAsKeys,
} from "./portal-view-as.ts";

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
  | { kind: "admin"; userId: string; viewAs?: ViewAsClaims }
  | { kind: "unauthorized" };

/**
 * Resolves whether the caller may act on behalf of `clientId` in the
 * portal. An admin (same check as resolveCaller's "admin" kind) always
 * may — that's the existing "preview as admin" path (/portal/:id?as=admin)
 * from the client's admin page. Otherwise the bearer token's own user must
 * be an ACTIVE row in client_portal_users for exactly this clientId.
 * Never trusts clientId alone, and never accepts the anon key.
 *
 * CRE-811 adds a third way in, in front of the other two: an `x-portal-view-as`
 * token, which is how **Open portal** now works. Pass `action` to enable it —
 * a call site that does not is one where no action has been parsed yet, and a
 * view-as token is refused there, because `VIEW_AS_READS` can only answer
 * "may this token do this" if it is told what "this" is. Fail closed.
 *
 * A view-as caller resolves to `{ kind: "admin", viewAs }` rather than a kind
 * of its own, deliberately: the eleven functions that already branch on
 * `caller.kind === "admin"` keep compiling and keep behaving, and the
 * narrowing that makes the token read-only happens here, once, instead of in
 * each of them.
 */
export async function resolvePortalCaller(
  req: Request,
  clientId: string,
  action?: string,
): Promise<PortalCaller> {
  const viewAs = await resolveViewAsCaller(req, clientId, action);
  if (viewAs !== null) return viewAs;

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

/* -- CRE-811: the view-as token --------------------------------------------
 *
 * The signing keys, one per issuer. Read here rather than passed in because
 * this is the only place in the portal that verifies, and an env read is not
 * a thing to hand around.
 *
 * AN UNSET KEY REFUSES ITS ISSUER. There is no development fallback, no
 * default and no "sign with the service key if nothing else is set" -- the
 * failure mode of a signature scheme with a guessable key is worse than the
 * failure mode of a button that says it is not configured.
 */
function viewAsKeys(): ViewAsKeys {
  return {
    admin: Deno.env.get("PORTAL_VIEW_AS_KEY") ?? "",
    plugin: Deno.env.get("PORTAL_VIEW_AS_PLUGIN_KEY") ?? "",
  };
}

/**
 * `null` when this is not a view-as request at all, so the caller falls
 * through to the session checks. A PRESENT-BUT-BAD token is `unauthorized`
 * and never falls through: a request that carried a forged or expired token
 * must not quietly succeed on some other credential it also happened to have.
 */
async function resolveViewAsCaller(
  req: Request,
  clientId: string,
  action: string | undefined,
): Promise<PortalCaller | null> {
  const token = req.headers.get(VIEW_AS_HEADER);
  if (token === null || token.length === 0) return null;

  const fn = functionNameFromUrl(req.url);
  const result = await verifyViewAsToken(token, viewAsKeys());
  if (!result.ok) {
    console.warn("[view-as] refused", { fn, reason: result.reason });
    return { kind: "unauthorized" };
  }
  const claims = result.claims;

  // The token names one client. A request naming another is the bug this
  // check exists for, whoever signed the token.
  if (!clientId || claims.cid !== clientId) {
    console.warn("[view-as] refused", { fn, reason: "wrong_client", jti: claims.jti });
    return { kind: "unauthorized" };
  }

  if (action === undefined || !viewAsMayRead(fn, action)) {
    console.warn("[view-as] refused", {
      fn,
      action: action ?? "(not parsed)",
      reason: "not_a_read",
      jti: claims.jti,
    });
    return { kind: "unauthorized" };
  }

  await logViewAsRedeemed(claims, req);
  return { kind: "admin", userId: claims.sub, viewAs: claims };
}

/**
 * One audit row the first time a token is actually used.
 *
 * The mint is already logged by `functions/portal-view-as`; this is the other
 * half of the question Bree asked -- who looked, not just who asked to. The
 * unique index on `(jti, event)` is what makes it one row rather than one per
 * request, so the insert below is a no-op on every call after the first.
 *
 * NEVER FAILS THE REQUEST. A log that can deny a read is a log that takes the
 * portal down when the table is missing, and the deploy order here is
 * function first, migration second. It warns and carries on.
 */
async function logViewAsRedeemed(claims: ViewAsClaims, req: Request): Promise<void> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return;
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const { error } = await sb.from("portal_view_as_log").insert({
      jti: claims.jti,
      event: "redeemed",
      issuer: claims.iss,
      client_id: claims.cid,
      actor_user_id: claims.iss === "admin" ? claims.sub : null,
      actor_label: claims.act,
      expires_at: new Date(claims.exp * 1000).toISOString(),
      user_agent: req.headers.get("user-agent"),
    });
    // 23505 is the unique violation, i.e. "already logged", i.e. working.
    if (error && error.code !== "23505") {
      console.warn("[view-as] redeem not logged", { jti: claims.jti, code: error.code });
    }
  } catch (caught) {
    console.warn("[view-as] redeem not logged", caught);
  }
}
