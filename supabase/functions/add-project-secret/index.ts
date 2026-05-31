// Admin-only endpoint to write per-client encrypted secrets
// (SureContact API key, MCP URL) into public.project_secrets.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ENC_KEY = Deno.env.get("PROJECT_SECRETS_KEY") ?? "";

const ALLOWED_KEYS = new Set(["surecontact_api_key", "surecontact_mcp_url"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  if (!ENC_KEY) return json({ error: "server misconfigured: PROJECT_SECRETS_KEY missing" }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  if (!userRes.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: userRes.user.id });
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  const clientProjectId = String(payload.client_project_id ?? "").trim();
  const key = String(payload.key ?? "").trim();
  const value = String(payload.value ?? "");
  const hint = payload.hint != null ? String(payload.hint).slice(0, 200) : null;

  if (!clientProjectId) return json({ error: "client_project_id required" }, 400);
  if (!ALLOWED_KEYS.has(key)) return json({ error: `key must be one of ${[...ALLOWED_KEYS].join(", ")}` }, 400);
  if (!value || value.length > 4096) return json({ error: "value required (max 4096 chars)" }, 400);

  if (key === "surecontact_mcp_url") {
    try {
      const u = new URL(value);
      if (u.protocol !== "https:" || !u.host.endsWith("surecontact.com")) {
        return json({ error: "MCP URL must be an https://*.surecontact.com URL" }, 400);
      }
    } catch { return json({ error: "MCP URL is not a valid URL" }, 400); }
  }

  const { data, error } = await admin.rpc("set_project_secret", {
    _client_project_id: clientProjectId,
    _key: key,
    _value: value,
    _hint: hint,
    _created_by: userRes.user.id,
    _enc_key: ENC_KEY,
  });

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, id: data });
});
