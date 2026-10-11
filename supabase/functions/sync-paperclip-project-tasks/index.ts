// Mirrors per-project Paperclip issue counts into paperclip_project_task_counts.
// Same auth/secret pattern as sync-paperclip-pending: a cron target guarded by
// CLAUDE_WEBHOOK_SECRET (x-agent-secret), with the Paperclip credential read
// from app_secrets (paperclip_board_api_key) — never a Function env var.
// One project's API failure is logged and skipped; it never stops the sync.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-agent-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PAPERCLIP_BASE = "https://paperclip.cre8visions.com";
const COMPANY_ID = "62e315f3-8d2c-49c9-8a67-00f151290b5c";

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getSecret(sb: ReturnType<typeof serviceClient>, key: string): Promise<string | null> {
  const { data } = await sb.from("app_secrets").select("value").eq("key", key).maybeSingle();
  return (data as { value?: string } | null)?.value ?? null;
}

interface ProjectRow { id: string; name: string | null; paperclip_project_id: string }
interface CompactIssue { status?: string | null }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = serviceClient();
  const secret = await getSecret(sb, "CLAUDE_WEBHOOK_SECRET");
  const supplied = req.headers.get("x-agent-secret") ?? new URL(req.url).searchParams.get("secret");
  if (!secret || supplied !== secret) return json({ error: "Unauthorized" }, 401);

  const apiKey = await getSecret(sb, "paperclip_board_api_key");
  if (!apiKey) return json({ error: "paperclip_board_api_key is not set" }, 500);

  const { data, error } = await sb
    .from("client_projects")
    .select("id, name, paperclip_project_id")
    .not("paperclip_project_id", "is", null);
  if (error) return json({ error: error.message }, 500);
  const projects = (data ?? []) as ProjectRow[];

  let synced = 0;
  const failures: { client_project_id: string; name: string | null; error: string }[] = [];

  for (const p of projects) {
    try {
      const res = await fetch(
        `${PAPERCLIP_BASE}/api/companies/${COMPANY_ID}/issues?projectId=${encodeURIComponent(p.paperclip_project_id)}&view=compact`,
        { headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } },
      );
      if (!res.ok) throw new Error(`issues ${res.status}: ${await res.text()}`);
      const body = await res.json();
      const issues: CompactIssue[] = Array.isArray(body) ? body : body?.items ?? body?.data ?? [];

      const byStatus: Record<string, number> = {};
      for (const i of issues) {
        const s = String(i?.status ?? "unknown");
        byStatus[s] = (byStatus[s] ?? 0) + 1;
      }
      const total = issues.length - (byStatus["cancelled"] ?? 0);
      const done = byStatus["done"] ?? 0;

      const { error: upErr } = await sb.from("paperclip_project_task_counts").upsert({
        client_project_id: p.id,
        paperclip_project_id: p.paperclip_project_id,
        total,
        open: total - done,
        done,
        by_status: byStatus,
        synced_at: new Date().toISOString(),
      }, { onConflict: "client_project_id" });
      if (upErr) throw new Error(`upsert: ${upErr.message}`);
      synced++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[sync-paperclip-project-tasks] project ${p.id} (${p.name ?? "unnamed"}) failed: ${msg}`);
      failures.push({ client_project_id: p.id, name: p.name, error: msg });
    }
  }

  return json({ ok: failures.length === 0, projects: projects.length, synced, failures });
});
