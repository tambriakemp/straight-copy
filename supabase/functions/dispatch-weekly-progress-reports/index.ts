import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Fans out generate-progress-report to every eligible project. Triggered
// weekly by pg_cron at Friday 21:00 UTC.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: projects, error } = await sb
    .from("client_projects")
    .select("id, name")
    .eq("progress_report_enabled", true)
    .eq("status", "active");

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const results: Array<{ projectId: string; name: string; ok: boolean; error?: string; skipped?: string }> = [];

  for (const p of projects ?? []) {
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/generate-progress-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
        body: JSON.stringify({ projectId: (p as any).id }),
      });
      const data = await resp.json().catch(() => ({}));
      results.push({
        projectId: (p as any).id,
        name: (p as any).name,
        ok: !!data?.ok,
        skipped: data?.skipped,
        error: data?.error,
      });
    } catch (e) {
      results.push({
        projectId: (p as any).id,
        name: (p as any).name,
        ok: false,
        error: e instanceof Error ? e.message : "fetch failed",
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, count: results.length, results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
