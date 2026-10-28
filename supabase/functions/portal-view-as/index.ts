// CRE-811: mints the token behind **Open portal**.
//
// Bree clicks it on a client's `/admin` page and lands in that client's portal
// seeing what the client sees, with no login prompt. The grant is issued HERE,
// in the `/admin` tab, where her admin session is already proven -- and not
// asserted by the destination URL, which is what `?as=admin` did and why the
// new tab could fall through to the client login.
//
// WHAT THIS FUNCTION WILL NOT DO
//
//  * **Mint for anybody but an admin.** `resolveCaller`'s "admin" kind, the
//    same gate `/admin` itself uses. No secret-header path and no service-role
//    path: nothing server-side needs to forge a human's view-as, and an
//    endpoint that would have let it is one a webhook bug could reach.
//  * **Mint for a client that is not there.** A token naming a non-existent
//    client is a token whose audit row names nothing.
//  * **Mint without writing the audit row.** Bree asked for each view-as to be
//    logged; a mint that failed to log and succeeded anyway would make the log
//    a thing you cannot reason from. If the insert fails this returns 503 and
//    no token -- which is also what happens if the migration has not been run
//    yet, deliberately, because that is a setup error and should read as one.
//  * **Mint without a key.** An unset `PORTAL_VIEW_AS_KEY` is 503, never a
//    default.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { resolveCaller } from "../_shared/webhook-auth.ts";
import { VIEW_AS_TTL_SECONDS, mintViewAsToken } from "../_shared/portal-view-as.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PORTAL_BASE_URL = Deno.env.get("PORTAL_BASE_URL") || "https://cre8visions.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const key = Deno.env.get("PORTAL_VIEW_AS_KEY") ?? "";
  if (key.length === 0) {
    return json(
      {
        error: "Viewing a client's portal is not set up on this install yet.",
        code: "view_as_not_configured",
      },
      503,
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const clientId = String(payload.clientId ?? "").trim();
  if (!clientId) return json({ error: "clientId required" }, 400);

  const caller = await resolveCaller(req);
  if (caller.kind !== "admin") return json({ error: "Unauthorized" }, 401);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: client, error: clientError } = await sb
    .from("clients")
    .select("id, business_name, contact_name")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError) {
    console.error("[portal-view-as] client lookup", clientError);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
  if (!client) return json({ error: "That client is not there.", code: "no_client" }, 404);

  // The admin in words, for the audit row and the banner. Their email is the
  // thing a person reading the log will recognise; the id is the thing that
  // survives a rename.
  const { data: actor } = await sb.auth.admin.getUserById(caller.userId);
  const actorLabel = actor?.user?.email ?? caller.userId;

  const jti = crypto.randomUUID();
  const { token, claims } = await mintViewAsToken(
    { iss: "admin", cid: clientId, sub: caller.userId, act: actorLabel, jti },
    key,
  );

  const { error: logError } = await sb.from("portal_view_as_log").insert({
    jti,
    event: "minted",
    issuer: "admin",
    client_id: clientId,
    actor_user_id: caller.userId,
    actor_label: actorLabel,
    expires_at: new Date(claims.exp * 1000).toISOString(),
    user_agent: req.headers.get("user-agent"),
  });
  if (logError) {
    console.error("[portal-view-as] audit insert", logError);
    return json(
      {
        error: "Viewing a client's portal is not set up on this install yet.",
        code: "view_as_not_logged",
      },
      503,
    );
  }

  // The fragment, not the query string. A fragment is never sent to a server,
  // so the token stays out of access logs, out of the `Referer` header on
  // every asset the portal then loads, and out of anything an edge proxy
  // records. The portal strips it from the address bar on arrival.
  return json({
    ok: true,
    token,
    url: `${PORTAL_BASE_URL}/portal/${clientId}#view-as=${token}`,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    ttlSeconds: VIEW_AS_TTL_SECONDS,
    clientName: client.business_name ?? client.contact_name ?? null,
    actor: actorLabel,
  });
});
