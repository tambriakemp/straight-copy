// Lists all SureContact email templates in the workspace so the admin can pick
// a template UUID for API-triggered transactional sends. Admin-gated.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    });
    const { data: isAdmin } = await admin.rpc("is_admin", {
      _user_id: userData.user.id,
    });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const apiKey = Deno.env.get("SURECONTACT_API_KEY");
    if (!apiKey) return json({ error: "SURECONTACT_API_KEY not configured" }, 500);

    const resp = await fetch(
      "https://api.surecontact.com/api/v1/public/email-templates?per_page=100",
      { headers: { "X-API-Key": apiKey, Accept: "application/json" } },
    );
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      return json(
        { error: `SureContact returned ${resp.status}`, details: data },
        502,
      );
    }

    const items: any[] = Array.isArray(data?.data) ? data.data : [];
    const templates = items.map((t: any) => ({
      uuid: t.uuid ?? null,
      name: t.name ?? "(untitled)",
      subject: t.subject ?? null,
      type: t.type ?? null,
    }));

    return json({ templates });
  } catch (e) {
    console.error("[list-surecontact-templates]", e);
    return json(
      { error: e instanceof Error ? e.message : "Server error" },
      500,
    );
  }
});
