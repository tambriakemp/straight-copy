// Public client-portal edge function — cancels or resumes a SureCart subscription
// for the client identified by clientId in the request body. Mirrors the access
// model used by brand-kit-intake (verify_jwt = false; gated by clientId URL).
//
// Actions:
//   - cancel : PATCH https://api.surecart.com/v1/subscriptions/{id}/cancel?cancel_behavior=immediate
//   - resume : PATCH https://api.surecart.com/v1/subscriptions/{id}/resume
//   - status : returns the current subscription status from the DB

import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SURECART_API = "https://api.surecart.com/v1";

type Action = "cancel" | "resume" | "status";

interface SubscriptionRow {
  id: string;
  surecart_subscription_id: string | null;
  subscription_status: string | null;
  subscription_canceled_at: string | null;
  subscription_current_period_end: string | null;
  subscription_cancel_at_period_end: boolean;
  tier: string;
  archived: boolean;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function uuid(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  );
}

async function callSureCart(
  path: string,
  apiToken: string,
  init: RequestInit = {},
) {
  const resp = await fetch(`${SURECART_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  let body: any = null;
  try {
    body = await resp.json();
  } catch {
    body = null;
  }
  return { ok: resp.ok, status: resp.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let payload: { clientId?: string; action?: Action };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { clientId, action } = payload;
  if (!uuid(clientId)) return json({ error: "invalid_client_id" }, 400);
  if (!action || !["cancel", "resume", "status"].includes(action)) {
    return json({ error: "invalid_action" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select(
      "id, surecart_subscription_id, subscription_status, subscription_canceled_at, subscription_current_period_end, subscription_cancel_at_period_end, tier, archived",
    )
    .eq("id", clientId)
    .maybeSingle<SubscriptionRow>();

  if (clientErr) {
    console.error("clients lookup error", clientErr);
    return json({ error: "lookup_failed" }, 500);
  }
  if (!client || client.archived) return json({ error: "client_not_found" }, 404);

  // status — no SureCart call needed
  if (action === "status") {
    return json({
      success: true,
      subscription: {
        id: client.surecart_subscription_id,
        status: client.subscription_status,
        canceled_at: client.subscription_canceled_at,
        current_period_end: client.subscription_current_period_end,
        cancel_at_period_end: client.subscription_cancel_at_period_end,
        tier: client.tier,
      },
    });
  }

  if (!client.surecart_subscription_id) {
    return json({ error: "no_subscription_linked" }, 400);
  }

  const apiToken = Deno.env.get("SURECART_API_TOKEN");
  if (!apiToken) {
    console.error("SURECART_API_TOKEN not configured");
    return json({ error: "not_configured" }, 500);
  }

  const subId = client.surecart_subscription_id;

  if (action === "cancel") {
    const { ok, status, body } = await callSureCart(
      `/subscriptions/${subId}/cancel?cancel_behavior=immediate`,
      apiToken,
      { method: "PATCH", body: JSON.stringify({}) },
    );
    if (!ok) {
      console.error("SureCart cancel failed", status, body);
      return json({ error: "surecart_error", status, body }, 502);
    }
    const sub = body || {};
    const canceledAt = sub.canceled_at
      ? new Date(
          (sub.canceled_at > 1e12 ? sub.canceled_at : sub.canceled_at * 1000),
        ).toISOString()
      : new Date().toISOString();
    const newStatus: string = sub.status || "canceled";
    const cancelAtPeriodEnd: boolean = !!sub.cancel_at_period_end;
    await supabase
      .from("clients")
      .update({
        subscription_status: newStatus,
        subscription_canceled_at: canceledAt,
        subscription_cancel_at_period_end: cancelAtPeriodEnd,
      })
      .eq("id", client.id);
    return json({
      success: true,
      subscription: {
        id: subId,
        status: newStatus,
        canceled_at: canceledAt,
        cancel_at_period_end: cancelAtPeriodEnd,
      },
    });
  }

  if (action === "resume") {
    const { ok, status, body } = await callSureCart(
      `/subscriptions/${subId}/resume`,
      apiToken,
      { method: "PATCH", body: JSON.stringify({}) },
    );
    if (!ok) {
      console.error("SureCart resume failed", status, body);
      return json({ error: "surecart_error", status, body }, 502);
    }
    const sub = body || {};
    const newStatus: string = sub.status || "active";
    const cancelAtPeriodEnd: boolean = !!sub.cancel_at_period_end;
    await supabase
      .from("clients")
      .update({
        subscription_status: newStatus,
        subscription_canceled_at: null,
        subscription_cancel_at_period_end: cancelAtPeriodEnd,
      })
      .eq("id", client.id);
    return json({
      success: true,
      subscription: {
        id: subId,
        status: newStatus,
        canceled_at: null,
        cancel_at_period_end: cancelAtPeriodEnd,
      },
    });
  }

  return json({ error: "unhandled_action" }, 400);
});
