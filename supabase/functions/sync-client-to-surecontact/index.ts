// Pushes a client record into SureContact, including their unique portal URL
// as a custom field so SureContact email templates can merge it.
//
// verify_jwt = false — invoked from server-side triggers (pg_net) and the
// admin UI with the publishable key. Always validates the clientId against
// the clients table before doing anything.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import {
  splitContactName,
  upsertSureContact,
} from "../_shared/surecontact.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PORTAL_BASE_URL =
  Deno.env.get("PORTAL_BASE_URL") || "https://cre8visions.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("SURECONTACT_API_KEY");
    if (!apiKey) {
      console.error("[sync-client-to-surecontact] SURECONTACT_API_KEY missing");
      return json({ success: false, error: "SURECONTACT_API_KEY not configured" }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const clientId = typeof body?.clientId === "string" ? body.clientId : null;
    if (!clientId) {
      return json({ success: false, error: "clientId is required" }, 400);
    }

    // Load client
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, business_name, contact_name, contact_email, contact_phone, tier, archived")
      .eq("id", clientId)
      .maybeSingle();

    if (clientErr) {
      console.error("[sync-client-to-surecontact] client lookup failed", clientErr);
      return json({ success: false, error: clientErr.message }, 500);
    }
    if (!client) return json({ success: false, error: "Client not found" }, 404);
    if (client.archived) {
      return json({ success: true, skipped: "archived" });
    }
    if (!client.contact_email) {
      return json({ success: false, error: "Client has no contact_email — cannot sync" }, 400);
    }

    // Active journey node (for stage tag + custom field)
    const { data: activeNode } = await supabase
      .from("journey_nodes")
      .select("key, label, order_index, status")
      .eq("client_id", clientId)
      .not("status", "in", "(complete,client_submitted)")
      .order("order_index", { ascending: true })
      .limit(1)
      .maybeSingle();

    // All possible stage labels across both tiers — used to remove stale
    // `Stage:` tags from SureContact so each contact carries only their
    // current stage.
    const { data: allTemplates } = await supabase
      .from("journey_templates")
      .select("label");
    const allStageTags = new Set<string>(
      (allTemplates ?? []).map((t) => `Stage: ${t.label}`),
    );
    allStageTags.add("Stage: Complete");

    const baseUrl = PORTAL_BASE_URL.replace(/\/$/, "");
    const portalUrl = `${baseUrl}/portal/${clientId}`;
    const contractUrl = `${baseUrl}/portal/${clientId}/contract`;
    const brandKitUrl = `${baseUrl}/portal/${clientId}/brand-kit`;
    const tierLabel = client.tier === "growth" ? "Growth" : "Launch";
    const stageLabel = activeNode?.label || "Complete";
    const currentStageTag = `Stage: ${stageLabel}`;

    const { firstName, lastName } = splitContactName(client.contact_name);

    const tags = [
      "Client Portal",
      `Tier: ${tierLabel}`,
      currentStageTag,
    ];

    // Every other known stage tag should be stripped on this sync.
    const tagsToRemove = Array.from(allStageTags).filter(
      (t) => t !== currentStageTag,
    );

    const result = await upsertSureContact(
      {
        email: client.contact_email,
        firstName,
        lastName,
        company: client.business_name,
        phone: client.contact_phone,
        customFields: {
          portal_url: portalUrl,
          contract_url: contractUrl,
          brand_kit_url: brandKitUrl,
          client_tier: tierLabel,
          journey_stage: stageLabel,
          journey_stage_key: activeNode?.key ?? "",
          client_id: clientId,
          company_name: client.business_name ?? "",
          phone: client.contact_phone ?? "",
        },
        tags,
        tagsToRemove,
        lists: ["Cre8 Visions Clients"],
        metadata: { form_source: "cre8visions_crm", trigger: "client_sync" },
      },
      apiKey,
    );

    if (!result.ok) {
      console.error("[sync-client-to-surecontact] upsert failed", result);
      return json(
        { success: false, error: result.error, status: result.status, surecontact: result.data },
        502,
      );
    }

    return json({
      success: true,
      portal_url: portalUrl,
      stage: stageLabel,
      tier: tierLabel,
      surecontact: result.data,
    });
  } catch (e) {
    console.error("[sync-client-to-surecontact] error", e);
    return json(
      { success: false, error: e instanceof Error ? e.message : "Server error" },
      500,
    );
  }
});
