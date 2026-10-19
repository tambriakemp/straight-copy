// Scheduled health sweep for the Agency MCP's list_tasks path (CRE-535).
//
// list_tasks 502'd under load because listTasks() in
// _shared/project-tasks.ts did an unscoped full-table scan over
// project_task_attachments on every call — that's fixed there. This sweep
// is the backstop the task also asked for: it re-runs listTasks against
// every active project on a timer, retries a failing project a couple of
// times, and — only if a project is still failing after every retry —
// sends an admin alert. No human has to notice a 502 for this to surface.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { listTasks } from "../_shared/project-tasks.ts";
import { resolveCaller } from "../_shared/webhook-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1500;
const PER_CALL_TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface SweepResult {
  id: string;
  name: string;
  ok: boolean;
  attempts: number;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const caller = await resolveCaller(req);
  if (caller.kind === "unauthorized") {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: projects, error } = await sb
    .from("client_projects")
    .select("id, name")
    .eq("status", "active");

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: SweepResult[] = [];

  for (const row of projects ?? []) {
    const project = row as { id: string; name: string };
    let ok = false;
    let lastError = "";
    let attempt = 0;
    for (attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await withTimeout(listTasks(sb, project.id), PER_CALL_TIMEOUT_MS);
        ok = true;
        break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt);
      }
    }
    results.push({ id: project.id, name: project.name, ok, attempts: attempt, error: ok ? undefined : lastError });
  }

  const failures = results.filter((r) => !r.ok);

  if (failures.length) {
    try {
      await sb.functions.invoke("send-transactional-email", {
        body: {
          templateName: "portal-health-sweep-failed-admin",
          // One alert per hour max, even if the cron runs every 15 minutes
          // and the outage is sustained.
          idempotencyKey: `portal-health-sweep-${new Date().toISOString().slice(0, 13)}`,
          templateData: {
            failedProjects: failures.map((f) => `${f.name} (${f.id})`).join(", "),
            detail: failures.map((f) => `${f.name}: ${f.error}`).join("\n"),
            attempts: MAX_ATTEMPTS,
          },
        },
      });
    } catch (e) {
      console.error("portal-health-sweep: failed to send admin alert", e);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, checked: results.length, failed: failures.length, results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
