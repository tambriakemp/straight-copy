// Cron-driven drainer for web_dev_scheduled_emails. Picks any rows whose
// send_after is in the past and sent_at is null, then fires the SureContact
// template. Invoked by pg_cron every 15 minutes.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { sendWebDevTemplate } from "../_shared/web-dev-emails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const nowIso = new Date().toISOString();
  const { data: due, error } = await sb
    .from("web_dev_scheduled_emails")
    .select("id, task_id, template_key, attempts")
    .is("sent_at", null)
    .lte("send_after", nowIso)
    .lt("attempts", 5)
    .order("send_after", { ascending: true })
    .limit(25);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const row of due ?? []) {
    // Resolve task → project → client
    const { data: task } = await sb
      .from("project_tasks")
      .select("id, client_project_id")
      .eq("id", row.task_id)
      .maybeSingle();
    if (!task) {
      await sb.from("web_dev_scheduled_emails").update({
        last_error: "task_missing",
        attempts: (row.attempts ?? 0) + 1,
      }).eq("id", row.id);
      continue;
    }
    const { data: proj } = await sb
      .from("client_projects")
      .select("client_id")
      .eq("id", task.client_project_id)
      .maybeSingle();
    if (!proj) {
      await sb.from("web_dev_scheduled_emails").update({
        last_error: "project_missing",
        attempts: (row.attempts ?? 0) + 1,
      }).eq("id", row.id);
      continue;
    }

    const result = await sendWebDevTemplate(sb, {
      taskId: task.id,
      templateKey: row.template_key as string,
      clientId: proj.client_id as string,
      projectId: task.client_project_id as string,
    });

    if (result.ok) {
      await sb.from("web_dev_scheduled_emails").update({
        sent_at: new Date().toISOString(),
        attempts: (row.attempts ?? 0) + 1,
        last_error: null,
      }).eq("id", row.id);
    } else {
      await sb.from("web_dev_scheduled_emails").update({
        last_error: result.error ?? "send_failed",
        attempts: (row.attempts ?? 0) + 1,
      }).eq("id", row.id);
    }
    results.push({ id: row.id, ok: result.ok, error: result.error ?? null });
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
