// CRE-536: first-time password setup for existing clients.
//
// Admin actions (invite / bulk_invite / status) require resolveCaller's
// "admin" kind — a real admin session, checked the same way every other
// admin-triggered function in this repo already is. "activate" is called
// by the client themselves, right after they set their password; it only
// ever touches rows that belong to their own auth.users id.
//
// Nothing here sends an email on its own initiative. invite/bulk_invite
// are only ever reached by a button an admin clicked.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { resolveCaller } from "../_shared/webhook-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-agent-secret",
};

const PORTAL_BASE_URL = Deno.env.get("PORTAL_BASE_URL") || "https://cre8visions.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Creates (or reuses) the auth.users row for `email` and returns a
 * one-time action link. type: 'invite' for a brand new address; falls
 * back to type: 'recovery' when that address already has an auth user
 * (a second client sharing the same contact email, or a resend) — both
 * land on the same /portal/set-password page and both let the client
 * call auth.updateUser({ password }) once the link is opened.
 */
async function createSetupLink(sb: ReturnType<typeof admin>, email: string) {
  const redirectTo = `${PORTAL_BASE_URL}/portal/set-password`;
  const invite = await sb.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });
  if (!invite.error && invite.data?.user) {
    return { userId: invite.data.user.id, actionLink: invite.data.properties.action_link };
  }
  const recovery = await sb.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  if (recovery.error || !recovery.data?.user) {
    throw new Error(recovery.error?.message || "could not create a setup link");
  }
  return { userId: recovery.data.user.id, actionLink: recovery.data.properties.action_link };
}

async function sendInviteEmail(
  sb: ReturnType<typeof admin>,
  opts: { email: string; actionLink: string; contactName: string | null; businessName: string | null },
) {
  try {
    await sb.functions.invoke("send-transactional-email", {
      body: {
        templateName: "portal-invite",
        recipientEmail: opts.email,
        templateData: {
          contactName: opts.contactName,
          businessName: opts.businessName,
          inviteUrl: opts.actionLink,
        },
      },
    });
  } catch (e) {
    console.error("[portal-invite] send-transactional-email failed (non-fatal):", e);
  }
}

/** One client's invite/resend, used by both `invite` and `bulk_invite`. */
async function inviteOne(
  sb: ReturnType<typeof admin>,
  callerUserId: string,
  params: { clientId: string; email: string; contactId?: string | null; contactName?: string | null; businessName?: string | null },
) {
  const { userId, actionLink } = await createSetupLink(sb, params.email);

  const { data: existing } = await sb
    .from("client_portal_users")
    .select("id, status")
    .eq("client_id", params.clientId)
    .eq("email", params.email)
    .maybeSingle();

  const nextStatus = existing?.status === "active" ? "active" : "invited";

  if (existing) {
    await sb
      .from("client_portal_users")
      .update({
        user_id: userId,
        contact_id: params.contactId ?? null,
        status: nextStatus,
        invited_at: new Date().toISOString(),
        invited_by: callerUserId,
      })
      .eq("id", existing.id);
  } else {
    await sb.from("client_portal_users").insert({
      client_id: params.clientId,
      contact_id: params.contactId ?? null,
      email: params.email,
      user_id: userId,
      status: "invited",
      invited_at: new Date().toISOString(),
      invited_by: callerUserId,
    });
  }

  await sendInviteEmail(sb, {
    email: params.email,
    actionLink,
    contactName: params.contactName ?? null,
    businessName: params.businessName ?? null,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = admin();
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  try {
    // -- activate: the client's own call, right after setting a password.
    if (action === "activate") {
      const auth = req.headers.get("Authorization");
      const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
      if (!bearer) return json({ error: "Unauthorized" }, 401);
      const { data: userData, error: userErr } = await sb.auth.getUser(bearer);
      if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

      const { error } = await sb
        .from("client_portal_users")
        .update({ status: "active", activated_at: new Date().toISOString() })
        .eq("user_id", userData.user.id)
        .neq("status", "active");
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // -- everything else is admin-only.
    const caller = await resolveCaller(req);
    if (caller.kind !== "admin") return json({ error: "Unauthorized" }, 401);

    if (action === "status") {
      const clientId = typeof body?.clientId === "string" ? body.clientId : null;

      let clientsQuery = sb
        .from("clients")
        .select("id, business_name, contact_name, contact_email, archived")
        .eq("archived", false);
      if (clientId) clientsQuery = clientsQuery.eq("id", clientId);
      const { data: clients, error: clientsErr } = await clientsQuery.order("business_name");
      if (clientsErr) return json({ error: clientsErr.message }, 500);

      const { data: portalUsers, error: puErr } = await sb
        .from("client_portal_users")
        .select("client_id, email, status, invited_at, activated_at");
      if (puErr) return json({ error: puErr.message }, 500);

      const byClient = new Map<string, typeof portalUsers>();
      for (const pu of portalUsers ?? []) {
        const list = byClient.get(pu.client_id) ?? [];
        list.push(pu);
        byClient.set(pu.client_id, list);
      }

      const rows = (clients ?? []).map((c) => {
        const invites = byClient.get(c.id) ?? [];
        const best =
          invites.find((i) => i.status === "active") ??
          invites.find((i) => i.status === "invited") ??
          invites[0] ??
          null;
        return {
          client_id: c.id,
          business_name: c.business_name,
          contact_name: c.contact_name,
          contact_email: c.contact_email,
          portal_status: best?.status ?? "not_invited",
          invited_at: best?.invited_at ?? null,
          activated_at: best?.activated_at ?? null,
          invite_count: invites.length,
        };
      });

      return json({ clients: rows });
    }

    if (action === "invite") {
      const clientId = String(body?.clientId ?? "").trim();
      const email = String(body?.email ?? "").trim().toLowerCase();
      const contactId = typeof body?.contactId === "string" ? body.contactId : null;
      if (!clientId || !email) return json({ error: "clientId and email are required" }, 400);

      const { data: client, error: clientErr } = await sb
        .from("clients")
        .select("id, business_name, contact_name")
        .eq("id", clientId)
        .maybeSingle();
      if (clientErr || !client) return json({ error: "client not found" }, 404);

      await inviteOne(sb, caller.userId, {
        clientId,
        email,
        contactId,
        contactName: client.contact_name,
        businessName: client.business_name,
      });
      return json({ ok: true });
    }

    if (action === "bulk_invite") {
      const { data: clients, error: clientsErr } = await sb
        .from("clients")
        .select("id, business_name, contact_name, contact_email")
        .eq("archived", false);
      if (clientsErr) return json({ error: clientsErr.message }, 500);

      const { data: alreadyInvited } = await sb
        .from("client_portal_users")
        .select("client_id");
      const invitedClientIds = new Set((alreadyInvited ?? []).map((r) => r.client_id));

      const results: Array<{ clientId: string; ok: boolean; reason?: string }> = [];
      for (const c of clients ?? []) {
        if (invitedClientIds.has(c.id)) {
          results.push({ clientId: c.id, ok: false, reason: "already invited" });
          continue;
        }
        const email = (c.contact_email || "").trim().toLowerCase();
        if (!email) {
          results.push({ clientId: c.id, ok: false, reason: "no contact email on file" });
          continue;
        }
        try {
          await inviteOne(sb, caller.userId, {
            clientId: c.id,
            email,
            contactName: c.contact_name,
            businessName: c.business_name,
          });
          results.push({ clientId: c.id, ok: true });
        } catch (e) {
          results.push({ clientId: c.id, ok: false, reason: e instanceof Error ? e.message : "failed" });
        }
      }

      return json({
        invited: results.filter((r) => r.ok).length,
        skipped: results.filter((r) => !r.ok).length,
        results,
      });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("[portal-invite] error:", e);
    return json({ error: e instanceof Error ? e.message : "internal error" }, 500);
  }
});
