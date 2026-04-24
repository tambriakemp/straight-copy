// REST API for the Client Pipeline CRM. Bearer token auth via api_tokens table.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const STAGES = [
  "intake_submitted", "brand_voice_generation", "build_in_progress",
  "ready_for_review", "delivered", "active_client",
] as const;
const TIERS = ["launch", "growth"] as const;
const AUTO_STATUS = ["not_started", "building", "live", "paused"] as const;

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ---- Auth ----
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Missing bearer token" }, 401);
  const token = auth.slice(7).trim();
  const hash = await sha256(token);
  const { data: tokenRow } = await supabase
    .from("api_tokens").select("id,revoked").eq("token_hash", hash).maybeSingle();
  if (!tokenRow || tokenRow.revoked) return json({ error: "Invalid or revoked token" }, 401);
  // fire-and-forget last_used_at update
  supabase.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id).then(() => {});

  // ---- Route ----
  const url = new URL(req.url);
  // Path comes through as /crm-api/<rest>
  let path = url.pathname.replace(/^\/crm-api\/?/, "/").replace(/\/+$/, "") || "/";
  const method = req.method;
  const parts = path.split("/").filter(Boolean);
  // parts examples: ["clients"], ["clients","<id>"], ["clients","<id>","checklist"], ["checklist","<id>"], ["automations","<id>"]

  try {
    // GET /clients
    if (method === "GET" && parts[0] === "clients" && parts.length === 1) {
      const stage = url.searchParams.get("stage");
      const tier = url.searchParams.get("tier");
      const search = url.searchParams.get("search");
      let q = supabase.from("clients").select("*").eq("archived", false).order("created_at", { ascending: false });
      if (stage) q = q.eq("stage", stage);
      if (tier) q = q.eq("tier", tier);
      if (search) q = q.or(`business_name.ilike.%${search}%,contact_name.ilike.%${search}%,contact_email.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ clients: data });
    }

    // POST /clients
    if (method === "POST" && parts[0] === "clients" && parts.length === 1) {
      const body = await req.json().catch(() => ({}));
      const schema = z.object({
        business_name: z.string().min(1).max(255),
        contact_name: z.string().max(255).nullish(),
        contact_email: z.string().email().max(255).nullish(),
        contact_phone: z.string().max(50).nullish(),
        tier: z.enum(TIERS).optional().default("launch"),
        stage: z.enum(STAGES).optional().default("intake_submitted"),
        intake_summary: z.string().nullish(),
        brand_voice_url: z.string().url().nullish(),
        notes: z.string().nullish(),
      });
      const parsed = schema.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
      const { data, error } = await supabase.from("clients").insert(parsed.data).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ client: data }, 201);
    }

    // GET /clients/:id  (with relations)
    if (method === "GET" && parts[0] === "clients" && parts.length === 2) {
      const id = parts[1];
      const [c, ch, au, de] = await Promise.all([
        supabase.from("clients").select("*").eq("id", id).maybeSingle(),
        supabase.from("client_checklist_items").select("*").eq("client_id", id).order("order_index"),
        supabase.from("client_automations").select("*").eq("client_id", id).order("created_at"),
        supabase.from("client_deliveries").select("*").eq("client_id", id).order("delivery_date", { ascending: false }),
      ]);
      if (!c.data) return json({ error: "Not found" }, 404);
      return json({ client: c.data, checklist: ch.data || [], automations: au.data || [], deliveries: de.data || [] });
    }

    // PATCH /clients/:id
    if (method === "PATCH" && parts[0] === "clients" && parts.length === 2) {
      const id = parts[1];
      const body = await req.json().catch(() => ({}));
      const schema = z.object({
        business_name: z.string().max(255).nullish(),
        contact_name: z.string().max(255).nullish(),
        contact_email: z.string().email().max(255).nullish(),
        contact_phone: z.string().max(50).nullish(),
        tier: z.enum(TIERS).optional(),
        stage: z.enum(STAGES).optional(),
        intake_summary: z.string().nullish(),
        brand_voice_url: z.string().url().nullish(),
        brand_voice_content: z.string().nullish(),
        notes: z.string().nullish(),
        archived: z.boolean().optional(),
      }).partial();
      const parsed = schema.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
      const { data, error } = await supabase.from("clients").update(parsed.data).eq("id", id).select().single();
      if (error) return json({ error: error.message }, error.code === "PGRST116" ? 404 : 500);
      return json({ client: data });
    }

    // POST /clients/:id/checklist
    if (method === "POST" && parts[0] === "clients" && parts[2] === "checklist" && parts.length === 3) {
      const client_id = parts[1];
      const body = await req.json().catch(() => ({}));
      const schema = z.object({
        label: z.string().min(1).max(500),
        completed: z.boolean().optional().default(false),
        order_index: z.number().int().optional().default(0),
      });
      const parsed = schema.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
      const { data, error } = await supabase.from("client_checklist_items").insert({ client_id, ...parsed.data }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ item: data }, 201);
    }

    // PATCH /checklist/:id
    if (method === "PATCH" && parts[0] === "checklist" && parts.length === 2) {
      const id = parts[1];
      const body = await req.json().catch(() => ({}));
      const schema = z.object({
        label: z.string().max(500).optional(),
        completed: z.boolean().optional(),
        order_index: z.number().int().optional(),
      });
      const parsed = schema.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
      const { data, error } = await supabase.from("client_checklist_items").update(parsed.data).eq("id", id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ item: data });
    }

    // POST /clients/:id/automations
    if (method === "POST" && parts[0] === "clients" && parts[2] === "automations" && parts.length === 3) {
      const client_id = parts[1];
      const body = await req.json().catch(() => ({}));
      const schema = z.object({
        name: z.string().min(1).max(255),
        status: z.enum(AUTO_STATUS).optional().default("not_started"),
        notes: z.string().nullish(),
      });
      const parsed = schema.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
      const { data, error } = await supabase.from("client_automations").insert({ client_id, ...parsed.data }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ automation: data }, 201);
    }

    // PATCH /automations/:id
    if (method === "PATCH" && parts[0] === "automations" && parts.length === 2) {
      const id = parts[1];
      const body = await req.json().catch(() => ({}));
      const schema = z.object({
        name: z.string().max(255).optional(),
        status: z.enum(AUTO_STATUS).optional(),
        notes: z.string().nullish(),
      });
      const parsed = schema.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
      const { data, error } = await supabase.from("client_automations").update(parsed.data).eq("id", id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ automation: data });
    }

    // POST /clients/:id/deliveries
    if (method === "POST" && parts[0] === "clients" && parts[2] === "deliveries" && parts.length === 3) {
      const client_id = parts[1];
      const body = await req.json().catch(() => ({}));
      const schema = z.object({
        delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        title: z.string().min(1).max(255),
        description: z.string().nullish(),
        link_url: z.string().url().nullish(),
      });
      const parsed = schema.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
      const { data, error } = await supabase.from("client_deliveries").insert({ client_id, ...parsed.data }).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ delivery: data }, 201);
    }

    // POST /clients/:id/documents  (save brand voice)
    if (method === "POST" && parts[0] === "clients" && parts[2] === "documents" && parts.length === 3) {
      const id = parts[1];
      const body = await req.json().catch(() => ({}));
      const schema = z.object({
        brand_voice_url: z.string().url().optional(),
        brand_voice_content: z.string().optional(),
      }).refine((d) => d.brand_voice_url || d.brand_voice_content, { message: "Provide brand_voice_url or brand_voice_content" });
      const parsed = schema.safeParse(body);
      if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
      const { data, error } = await supabase.from("clients").update(parsed.data).eq("id", id).select().single();
      if (error) return json({ error: error.message }, 500);
      return json({ client: data });
    }

    return json({ error: "Not found", path, method }, 404);
  } catch (e) {
    console.error("crm-api error:", e);
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
