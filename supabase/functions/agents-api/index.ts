// Agents API — read agents and runs, approve or reject proposed actions,
// register a browser for push, and trigger a run on demand.
//
// Routed like crm-api / ventures-api. Auth is an admin session JWT or an
// api_tokens bearer, so an agent could eventually drive this surface too.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "npm:zod@3.23.8";
import { executeAndRecord, type ActionRow } from "../_shared/agents/actions.ts";
import { nextRunAfter } from "../_shared/agents/schedule.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Turn a cron into the short badge the dashboard shows. */
function cadenceOf(cron: string | null): string | null {
  if (!cron) return null;
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [, , dom, mon, dow] = f;
  if (dom !== "*" || mon !== "*") return null;
  if (dow === "*") return "daily";
  if (dow === "1-5") return "weekdays";
  if (/^\d$/.test(dow)) return "weekly";
  return null;
}

const serviceClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Returns the acting user's id when it's a session, or null for a machine token. */
async function authorize(
  req: Request,
  sb: ReturnType<typeof serviceClient>,
): Promise<{ userId: string | null } | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = auth.slice(7).trim();

  const { data: tok } = await sb.from("api_tokens")
    .select("id, revoked").eq("token_hash", await sha256(token)).maybeSingle();
  if (tok && !tok.revoked) {
    sb.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tok.id).then(() => {});
    return { userId: null };
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) return json({ error: "Unauthorized" }, 401);
  const { data: admin } = await sb.from("admin_users").select("id").eq("user_id", data.user.id).maybeSingle();
  if (!admin) return json({ error: "Forbidden" }, 403);
  return { userId: data.user.id };
}

const AgentPatch = z.object({
  enabled: z.boolean().optional(),
  autonomy: z.enum(["propose", "act_in_app", "autonomous"]).optional(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  model: z.string().max(80).optional(),
  schedule_cron: z.string().max(120).nullish(),
  system_prompt: z.string().max(20000).nullish(),
  delivery: z.record(z.string(), z.boolean()).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  name: z.string().min(1).max(80).optional(),
  avatar_url: z.string().max(1000).nullish(),
  accent_color: z.string().max(32).nullish(),
});

const PushSub = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(200) }),
  user_agent: z.string().max(400).nullish(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = serviceClient();
  const guard = await authorize(req, sb);
  if (guard instanceof Response) return guard;
  const { userId } = guard;

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/agents-api\/?/, "/").replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  const method = req.method;
  const readBody = async () => { try { return await req.json(); } catch { return null; } };

  try {
    // ==================== /dashboard ====================
    // Everything the reworked home screen needs, in one round trip: the agent
    // roster with a short activity log each, four counts, and a merged
    // "up next" feed.
    if (parts[0] === "dashboard" && parts.length === 1 && method === "GET") {
      const todayIso = new Date().toISOString().slice(0, 10);
      const in14 = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

      const [
        agentsRes, runsRes, pendingRes,
        openTasksRes, overdueRes, activeProjectsRes, needsReviewRes,
        readyRes, upcomingRes, projectsRes,
      ] = await Promise.all([
        sb.from("agents").select("*").order("created_at"),
        // Recent runs across all agents; sliced per agent below.
        sb.from("agent_runs").select("id, agent_id, status, headline, started_at")
          .order("started_at", { ascending: false }).limit(120),
        sb.from("agent_pending_actions_v").select("agent_id"),

        sb.from("project_tasks").select("id", { count: "exact", head: true }).neq("status", "complete"),
        sb.from("project_tasks").select("id", { count: "exact", head: true })
          .neq("status", "complete").lt("due_date", todayIso),
        sb.from("client_projects").select("id", { count: "exact", head: true }).eq("status", "active"),
        sb.from("project_tasks").select("id", { count: "exact", head: true }).eq("status", "needs_review"),

        // Up next, source 1: the engineering queue.
        sb.from("project_tasks")
          .select("id, name, client_project_id, priority, due_date, order_index")
          .eq("status", "ready_for_claude").order("order_index").limit(12),
        // Up next, source 2: anything dated soon, from any project.
        sb.from("project_tasks")
          .select("id, name, client_project_id, priority, due_date, status")
          .neq("status", "complete").not("due_date", "is", null).lte("due_date", in14)
          .order("due_date", { ascending: true }).limit(20),
        sb.from("client_projects").select("id, client_id, name"),
      ]);

      // --- agent cards ---
      const pendingBy: Record<string, number> = {};
      for (const p of pendingRes.data ?? []) pendingBy[p.agent_id] = (pendingBy[p.agent_id] ?? 0) + 1;

      const runsBy: Record<string, Array<Record<string, unknown>>> = {};
      for (const r of runsRes.data ?? []) (runsBy[r.agent_id] ??= []).push(r);

      const agents = (agentsRes.data ?? []).map((a) => ({
        id: a.id, key: a.key, name: a.name, role: a.role,
        description: a.description, enabled: a.enabled, autonomy: a.autonomy,
        avatar_url: a.avatar_url, accent_color: a.accent_color,
        schedule_cron: a.schedule_cron, last_run_at: a.last_run_at,
        next_run_at: a.next_run_at ??
          (a.schedule_cron ? nextRunAfter(a.schedule_cron, new Date())?.toISOString() ?? null : null),
        pending_actions: pendingBy[a.id] ?? 0,
        // The small log on each card.
        recent: (runsBy[a.id] ?? []).slice(0, 4),
      }));

      // --- up next ---
      const projMap: Record<string, { name: string | null; client_id: string }> = {};
      for (const p of projectsRes.data ?? []) projMap[p.id] = { name: p.name, client_id: p.client_id };
      const clientIds = [...new Set(Object.values(projMap).map((p) => p.client_id))];
      const clientName: Record<string, string> = {};
      if (clientIds.length) {
        const { data: cls } = await sb.from("clients")
          .select("id, business_name, contact_name").in("id", clientIds);
        for (const c of cls ?? []) clientName[c.id] = c.business_name || c.contact_name || "Untitled";
      }
      const where = (projectId: string | null) => {
        const p = projectId ? projMap[projectId] : null;
        if (!p) return null;
        const client = clientName[p.client_id];
        return [client, p.name].filter(Boolean).join(" · ") || null;
      };

      type UpNext = {
        kind: "queue" | "task" | "agent";
        id: string; title: string; subtitle: string | null;
        at: string | null; badge: string | null;
        agent_id?: string; client_project_id?: string | null;
      };

      const upNext: UpNext[] = [];
      const seen = new Set<string>();

      for (const t of readyRes.data ?? []) {
        seen.add(t.id);
        upNext.push({
          kind: "queue", id: t.id, title: t.name, subtitle: where(t.client_project_id),
          at: t.due_date, badge: "ready", client_project_id: t.client_project_id,
        });
      }
      for (const t of upcomingRes.data ?? []) {
        // A ready_for_claude task with a due date appears in both queries.
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        upNext.push({
          kind: "task", id: t.id, title: t.name, subtitle: where(t.client_project_id),
          at: t.due_date,
          badge: t.due_date && t.due_date < todayIso ? "overdue" : null,
          client_project_id: t.client_project_id,
        });
      }
      for (const a of agents) {
        if (!a.enabled || !a.next_run_at) continue;
        upNext.push({
          kind: "agent", id: `agent-${a.id}`, title: `${a.name} — scheduled run`,
          subtitle: a.role, at: a.next_run_at,
          badge: cadenceOf(a.schedule_cron), agent_id: a.id,
        });
      }

      // Undated work sorts last: it is real, but it is not "next".
      upNext.sort((x, y) => {
        if (!x.at && !y.at) return 0;
        if (!x.at) return 1;
        if (!y.at) return -1;
        return x.at.localeCompare(y.at);
      });

      return json({
        agents,
        stats: {
          open_tasks: openTasksRes.count ?? 0,
          overdue_tasks: overdueRes.count ?? 0,
          active_projects: activeProjectsRes.count ?? 0,
          needs_review: needsReviewRes.count ?? 0,
        },
        up_next: upNext.slice(0, 25),
        total_pending: pendingRes.data?.length ?? 0,
      });
    }

    // ==================== /agents ====================
    if (parts[0] === "agents" && parts.length === 1 && method === "GET") {
      const [{ data: agents }, { data: pending }, { data: recent }] = await Promise.all([
        sb.from("agents").select("*").order("created_at"),
        sb.from("agent_pending_actions_v").select("agent_id"),
        sb.from("agent_runs").select("id, agent_id, status, headline, started_at")
          .order("started_at", { ascending: false }).limit(60),
      ]);

      const pendingBy: Record<string, number> = {};
      for (const p of pending ?? []) pendingBy[p.agent_id] = (pendingBy[p.agent_id] ?? 0) + 1;

      const lastBy: Record<string, unknown> = {};
      for (const r of recent ?? []) if (!(r.agent_id in lastBy)) lastBy[r.agent_id] = r;

      return json({
        agents: (agents ?? []).map((a) => ({
          ...a,
          pending_actions: pendingBy[a.id] ?? 0,
          last_run: lastBy[a.id] ?? null,
          next_run_at: a.schedule_cron
            ? (a.next_run_at ?? nextRunAfter(a.schedule_cron, new Date())?.toISOString() ?? null)
            : null,
        })),
        total_pending: pending?.length ?? 0,
      });
    }

    // ==================== /agents/:id ====================
    if (parts[0] === "agents" && parts.length === 2) {
      const id = parts[1];
      if (method === "GET") {
        const [{ data: agent }, { data: runs }] = await Promise.all([
          sb.from("agents").select("*").eq("id", id).maybeSingle(),
          sb.from("agent_runs").select("id, status, trigger, headline, started_at, finished_at, error")
            .eq("agent_id", id).order("started_at", { ascending: false }).limit(30),
        ]);
        if (!agent) return json({ error: "Not found" }, 404);
        return json({
          agent: {
            ...agent,
            next_run_at: agent.schedule_cron
              ? (agent.next_run_at ?? nextRunAfter(agent.schedule_cron, new Date())?.toISOString() ?? null)
              : null,
          },
          runs: runs ?? [],
        });
      }
      if (method === "PATCH") {
        const parsed = AgentPatch.safeParse(await readBody());
        if (!parsed.success) return json({ error: "Invalid patch", details: parsed.error.flatten() }, 400);
        const patch: Record<string, unknown> = { ...parsed.data };
        // Recompute the next fire time whenever the schedule changes.
        if ("schedule_cron" in parsed.data) {
          patch.next_run_at = parsed.data.schedule_cron
            ? nextRunAfter(parsed.data.schedule_cron, new Date())?.toISOString() ?? null
            : null;
        }
        const { data, error } = await sb.from("agents").update(patch).eq("id", id).select().single();
        if (error) return json({ error: error.message }, 400);
        return json({ agent: data });
      }
    }

    // ==================== /agents/:id/run ====================
    if (parts[0] === "agents" && parts[2] === "run" && method === "POST") {
      const secret = Deno.env.get("CLAUDE_WEBHOOK_SECRET");
      if (!secret) return json({ error: "CLAUDE_WEBHOOK_SECRET is not configured" }, 500);
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/agent-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-agent-secret": secret },
        body: JSON.stringify({ agent_id: parts[1], trigger: "manual" }),
      });
      const payload = await res.json().catch(() => ({}));
      return json(payload, res.status);
    }

    // ==================== /runs/:id ====================
    if (parts[0] === "runs" && parts.length === 2 && method === "GET") {
      const [{ data: run }, { data: actions }] = await Promise.all([
        sb.from("agent_runs").select("*").eq("id", parts[1]).maybeSingle(),
        sb.from("agent_actions").select("*").eq("run_id", parts[1]).order("created_at"),
      ]);
      if (!run) return json({ error: "Not found" }, 404);
      const { data: agent } = await sb.from("agents")
        .select("id, key, name, role, autonomy").eq("id", run.agent_id).maybeSingle();
      return json({ run, agent, actions: actions ?? [] });
    }

    // ==================== /runs (recent, across agents) ====================
    if (parts[0] === "runs" && parts.length === 1 && method === "GET") {
      const { data } = await sb.from("agent_runs")
        .select("id, agent_id, status, trigger, headline, started_at, finished_at")
        .order("started_at", { ascending: false })
        .limit(Math.min(Number(url.searchParams.get("limit") ?? 25), 100));
      return json({ runs: data ?? [] });
    }

    // ==================== /actions/pending ====================
    if (parts[0] === "actions" && parts[1] === "pending" && method === "GET") {
      const { data } = await sb.from("agent_pending_actions_v").select("*").limit(50);
      return json({ actions: data ?? [] });
    }

    // ==================== /actions/:id/approve | /reject ====================
    if (parts[0] === "actions" && parts.length === 3 && method === "POST") {
      const [, id, verb] = parts;
      const { data: action } = await sb.from("agent_actions").select("*").eq("id", id).maybeSingle();
      if (!action) return json({ error: "Not found" }, 404);
      if (action.status !== "proposed") {
        return json({ error: `Action is already ${action.status}` }, 409);
      }

      if (verb === "reject") {
        const { data, error } = await sb.from("agent_actions").update({
          status: "rejected", decided_by: userId, decided_at: new Date().toISOString(),
        }).eq("id", id).select().single();
        if (error) return json({ error: error.message }, 400);
        return json({ action: data });
      }

      if (verb === "approve") {
        const { data: agent } = await sb.from("agents").select("name").eq("id", action.agent_id).maybeSingle();
        await sb.from("agent_actions").update({
          decided_by: userId, decided_at: new Date().toISOString(),
        }).eq("id", id);
        const outcome = await executeAndRecord(sb, action as ActionRow, agent?.name ?? "Agent");
        const { data: fresh } = await sb.from("agent_actions").select("*").eq("id", id).maybeSingle();
        return json({ action: fresh, ok: outcome.ok, error: outcome.error }, outcome.ok ? 200 : 500);
      }
    }

    // ==================== /push/subscribe | /push/unsubscribe ====================
    if (parts[0] === "push" && parts[1] === "subscribe" && method === "POST") {
      if (!userId) return json({ error: "Push requires a signed-in admin" }, 403);
      const parsed = PushSub.safeParse(await readBody());
      if (!parsed.success) return json({ error: "Invalid subscription", details: parsed.error.flatten() }, 400);
      const { error } = await sb.from("push_subscriptions").upsert({
        user_id: userId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        user_agent: parsed.data.user_agent ?? null,
        last_used_at: new Date().toISOString(),
      }, { onConflict: "endpoint" });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (parts[0] === "push" && parts[1] === "unsubscribe" && method === "POST") {
      const body = await readBody();
      const endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
      if (!endpoint) return json({ error: "endpoint required" }, 400);
      await sb.from("push_subscriptions").delete().eq("endpoint", endpoint);
      return json({ ok: true });
    }

    // Public key so the browser can subscribe. Safe to expose by design.
    if (parts[0] === "push" && parts[1] === "config" && method === "GET") {
      const key = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
      return json({ configured: !!key, public_key: key || null });
    }

    return json({ error: "Not found", path }, 404);
  } catch (e) {
    console.error("agents-api error", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
