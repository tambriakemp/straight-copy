// Admin-only onboarding-invite management (CRE-822, G6): "All invites" and
// the per-client "Brand Voice chat link" panel.
//
// Both used to query `onboarding_invites` straight from the browser via RLS.
// That stops being possible the day this install is plugin-backed -- the
// plugin credential lives server-side only -- so this function exists
// unconditionally, even while the admin tables still answer every call,
// rather than adding it the day of the cutover. See
// `_shared/onboarding-invite-source.ts` for which source answers and why
// some of what the browser used to do (read a token back off a list) is no
// longer possible once the plugin is the source.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { resolveCaller } from "../_shared/webhook-auth.ts";
import { InviteError, onboardingInviteSource, type InviteRecord } from "../_shared/onboarding-invite-source.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Never the token -- see `InviteRecord`'s own header. */
function withoutToken(invite: InviteRecord): Omit<InviteRecord, "token"> {
  const { token: _token, ...rest } = invite;
  return rest;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const caller = await resolveCaller(req);
  if (caller.kind !== "admin") return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const source = onboardingInviteSource(supabase as never);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const action = String(payload.action ?? "");

  try {
    switch (action) {
      // Invites.tsx's "All invites" list. Tokenless, same as the plugin's
      // own list route -- the browser never held one for an existing
      // invite even on the admin-tables bridge; it only ever saw the token
      // once, right after `create`, and copied it to the clipboard then.
      case "list": {
        const invites = await source.listCompany({});
        return json({ invites: invites.map(withoutToken) });
      }

      case "create": {
        const expiresInDays = typeof payload.expiresInDays === "number" ? payload.expiresInDays : 30;
        const invite = await source.create({
          contactName: optionalText(payload.contactName),
          contactEmail: optionalText(payload.contactEmail),
          businessName: optionalText(payload.businessName),
          note: optionalText(payload.note),
          tier: optionalText(payload.tier),
          clientId: optionalText(payload.clientId),
          expiresInDays,
        });
        // The one response that carries the token -- the caller just asked
        // for a link to send.
        return json({ invite });
      }

      case "revoke": {
        const id = String(payload.id ?? "");
        if (!id) return json({ error: "id required" }, 400);
        const invite = await source.revoke(id);
        return json({ invite: withoutToken(invite) });
      }

      // AutomationBuildView's panel: the most relevant invite for one
      // client, by whichever hints the caller already has in hand.
      case "for-client": {
        const invite = await source.findForClient({
          clientId: optionalText(payload.clientId),
          submissionId: optionalText(payload.submissionId),
          contactEmail: optionalText(payload.contactEmail),
        });
        return json({ invite: invite ? withoutToken(invite) : null });
      }

      // "Generate & copy link": reuse a live invite for this client if one
      // exists, otherwise mint one. The token is populated when this call
      // minted the invite; it is null when an existing one on the plugin
      // path answered instead -- that install has no route left to recover
      // it (see this file's header), so the panel draws the status with no
      // working link rather than a stale or wrong one.
      case "ensure-for-client": {
        const existing = await source.findForClient({
          clientId: optionalText(payload.clientId),
          submissionId: optionalText(payload.submissionId),
          contactEmail: optionalText(payload.contactEmail),
        });
        if (existing) return json({ invite: existing, minted: false });
        const invite = await source.create({
          clientId: optionalText(payload.clientId),
          contactName: optionalText(payload.contactName),
          contactEmail: optionalText(payload.contactEmail),
          businessName: optionalText(payload.businessName),
          tier: optionalText(payload.tier),
          note: "Auto-generated from client detail",
          expiresInDays: 30,
        });
        return json({ invite, minted: true });
      }

      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (caught) {
    if (caught instanceof InviteError) {
      return json({ error: caught.message, code: caught.code }, caught.status);
    }
    console.error("[onboarding-invites-admin]", action, caught);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});

function optionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
