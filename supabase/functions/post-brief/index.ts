// Ingest endpoint for Ara's twice-daily brief routine (CRE-235). Auth is a
// shared secret, same shape as dispatch-social-schedule's x-agent-secret, but
// the expected value lives in app_secrets.briefs_ingest_secret — a row the
// Briefs tab's Settings card lets Bree generate/show/rotate herself, rather
// than a Supabase Function env var nobody but Lovable can set.
//
// external_id dedupes retried POSTs: an existing id returns the existing row
// (200) instead of inserting a duplicate.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-agent-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

interface BriefSection {
  heading: string;
  items: { text: string; link: string | null }[];
}

function validate(body: unknown): string | null {
  if (!body || typeof body !== "object") return "body must be an object";
  const b = body as Record<string, unknown>;
  if (b.period !== "morning" && b.period !== "evening") {
    return "period must be 'morning' or 'evening'";
  }
  if (typeof b.title !== "string" || !b.title.trim()) {
    return "title must be a non-empty string";
  }
  if (!Array.isArray(b.sections) || !b.sections.length) {
    return "sections must be a non-empty array";
  }
  for (const section of b.sections as unknown[]) {
    if (!section || typeof section !== "object") return "each section must be an object";
    const s = section as Record<string, unknown>;
    if (typeof s.heading !== "string" || !s.heading.trim()) {
      return "every section needs a non-empty heading";
    }
    if (!Array.isArray(s.items)) return "every section needs an items array";
    for (const item of s.items as unknown[]) {
      if (!item || typeof item !== "object") return "each item must be an object";
      const i = item as Record<string, unknown>;
      if (typeof i.text !== "string" || !i.text.trim()) {
        return "every item needs a non-empty text";
      }
      if (i.link !== null && i.link !== undefined && typeof i.link !== "string") {
        return "item.link must be a string or null";
      }
    }
  }
  if (b.external_id !== undefined && b.external_id !== null && typeof b.external_id !== "string") {
    return "external_id must be a string";
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const sb = serviceClient();

  const { data: secretRow } = await sb
    .from("app_secrets")
    .select("value")
    .eq("key", "briefs_ingest_secret")
    .maybeSingle();
  const supplied = req.headers.get("x-agent-secret");
  if (!secretRow?.value || supplied !== secretRow.value) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "body must be valid JSON" }, 400);
  }

  const problem = validate(body);
  if (problem) return json({ error: problem }, 400);

  const b = body as {
    external_id?: string | null;
    period: "morning" | "evening";
    title: string;
    sections: BriefSection[];
  };

  if (b.external_id) {
    const { data: existing } = await sb
      .from("briefs")
      .select("id, created_at")
      .eq("external_id", b.external_id)
      .maybeSingle();
    if (existing) return json({ id: existing.id, created_at: existing.created_at }, 200);
  }

  const { data: inserted, error } = await sb
    .from("briefs")
    .insert({
      external_id: b.external_id ?? null,
      period: b.period,
      title: b.title,
      sections: b.sections,
    })
    .select("id, created_at")
    .single();

  if (error) return json({ error: error.message }, 500);
  return json({ id: inserted.id, created_at: inserted.created_at }, 201);
});
