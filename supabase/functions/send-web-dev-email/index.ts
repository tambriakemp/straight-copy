// Admin-only endpoint to send a SureContact Web Dev template manually from a
// task card in the admin tasks panel.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { findTaskByTemplate, scheduleWebDevEmail, sendWebDevTemplate } from "../_shared/web-dev-emails.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function service() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function requireAdmin(req: Request): Promise<true | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = auth.slice(7);
  const c = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data } = await c.auth.getUser(token);
  if (!data?.user) return json({ error: "Unauthorized" }, 401);
  const sb = service();
  const { data: admin } = await sb.from("admin_users").select("id").eq("user_id", data.user.id).maybeSingle();
  if (!admin) return json({ error: "Forbidden" }, 403);
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const guard = await requireAdmin(req);
  if (guard !== true) return guard;

  const body = await req.json().catch(() => ({}));
  const taskId = body.task_id as string | undefined;
  const extra = (body.extra_merge_fields ?? {}) as Record<string, string>;
  if (!taskId) return json({ error: "task_id required" }, 400);

  const sb = service();
  const { data: task, error: taskErr } = await sb
    .from("project_tasks")
    .select("id, client_project_id, email_template")
    .eq("id", taskId)
    .maybeSingle();
  if (taskErr || !task) return json({ error: "Task not found" }, 404);
  const tpl = (task.email_template as any) || null;
  if (!tpl?.template_key) return json({ error: "Task has no email template bound" }, 400);

  const { data: proj } = await sb
    .from("client_projects")
    .select("client_id")
    .eq("id", task.client_project_id)
    .maybeSingle();
  if (!proj) return json({ error: "Project not found" }, 404);

  const result = await sendWebDevTemplate(sb, {
    taskId: task.id,
    templateKey: tpl.template_key,
    clientId: proj.client_id as string,
    projectId: task.client_project_id as string,
    extraMergeFields: extra,
  });

  // When launch confirmation is sent, schedule the post-launch follow-up
  // for 3 days later on the task that's bound to that template.
  if (result.ok && tpl.template_key === "web-dev-launch-confirmation") {
    try {
      const followupTask = await findTaskByTemplate(
        sb,
        task.client_project_id as string,
        "web-dev-postlaunch-followup",
      );
      if (followupTask) {
        const sendAfter = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        await scheduleWebDevEmail(sb, {
          taskId: followupTask.id,
          templateKey: "web-dev-postlaunch-followup",
          sendAfter,
        });
      }
    } catch (e) {
      console.warn("[send-web-dev-email] enqueue follow-up failed:", e);
    }
  }

  return json(result, result.ok ? 200 : (result.status || 500));
});
