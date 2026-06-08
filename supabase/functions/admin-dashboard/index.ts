// Admin dashboard data + Claude run webhook
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-claude-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const serviceClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function requireAdmin(req: Request): Promise<{ userId: string } | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = auth.slice(7);
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return json({ error: "Unauthorized" }, 401);
  const sb = serviceClient();
  const { data: admin } = await sb.from("admin_users").select("id").eq("user_id", data.user.id).maybeSingle();
  if (!admin) return json({ error: "Forbidden" }, 403);
  return { userId: data.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/admin-dashboard\/?/, "/").replace(/\/+$/, "") || "/";
  const sb = serviceClient();

  try {
    // ===== Claude run completed webhook (no JWT — uses shared secret) =====
    if (path === "/claude-run" && req.method === "POST") {
      const secret = Deno.env.get("CLAUDE_WEBHOOK_SECRET");
      const supplied = req.headers.get("x-claude-secret") || url.searchParams.get("secret");
      if (!secret || supplied !== secret) return json({ error: "Unauthorized" }, 401);
      const body = await req.json().catch(() => ({}));
      const title = String(body.title || "Claude completed a run");
      const description = body.description ? String(body.description) : null;
      const client_id = body.client_id || null;
      const client_project_id = body.client_project_id || null;
      const task_id = body.task_id || null;
      const actor = body.actor || "Claude";
      const metadata = { ...(body.metadata || {}), task_id };
      const { error } = await sb.from("activity_events").insert({
        kind: "claude_run_completed",
        title, description, client_id, client_project_id, actor, metadata,
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // All endpoints below require admin auth
    const guard = await requireAdmin(req);
    if (guard instanceof Response) return guard;

    // ===== GET /summary — KPIs + activity + upcoming tasks + recent + revenue + approvals =====
    if (path === "/summary" && req.method === "GET") {
      const todayIso = new Date().toISOString().slice(0, 10);
      const in14 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const [
        clientsRes, projectsRes, tasksOpenRes, tasksOverdueRes, approvalsPendRes,
        invoicesUnpaidRes, activityRes, upcomingRes, recentClientsRes,
        invoicesPaidRes, subsActiveRes,
      ] = await Promise.all([
        sb.from("clients").select("id", { count: "exact", head: true }).eq("archived", false),
        sb.from("client_projects").select("id", { count: "exact", head: true }).eq("status", "active"),
        sb.from("project_tasks").select("id", { count: "exact", head: true }).neq("status", "complete"),
        sb.from("project_tasks").select("id", { count: "exact", head: true })
          .neq("status", "complete").lt("due_date", todayIso),
        // Pending approvals: preview pages w/ no approval, signed contracts/proposals tracked separately.
        sb.from("client_proposals").select("id, title, client_id, created_at", { count: "exact" }).eq("status", "sent").order("created_at", { ascending: false }).limit(10),
        sb.from("project_invoices").select("id, label, amount_cents, client_id, due_date", { count: "exact" })
          .in("status", ["sent", "scheduled"]).order("due_date", { ascending: true }).limit(10),
        sb.from("activity_events").select("*").order("occurred_at", { ascending: false }).limit(40),
        sb.from("project_tasks")
          .select("id, name, due_date, status, priority, client_project_id, assignee_kind")
          .in("assignee_kind", ["agency", "auto"])
          .neq("status", "complete")
          .or(`due_date.lte.${in14},due_date.lt.${todayIso}`)
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(25),
        sb.from("clients").select("id, business_name, contact_name, updated_at")
          .eq("archived", false).order("updated_at", { ascending: false }).limit(6),
        sb.from("project_invoices").select("amount_cents, paid_at").eq("status", "paid")
          .gte("paid_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        sb.from("clients").select("id", { count: "exact", head: true })
          .eq("archived", false).eq("subscription_status", "active"),
      ]);

      // Hydrate upcoming tasks with client/project names
      const projIds = Array.from(new Set((upcomingRes.data || []).map((t: any) => t.client_project_id).filter(Boolean)));
      let projMap: Record<string, { client_id: string; name: string | null }> = {};
      let clientMap: Record<string, string> = {};
      if (projIds.length) {
        const { data: projs } = await sb.from("client_projects").select("id, client_id, name").in("id", projIds);
        (projs || []).forEach((p: any) => { projMap[p.id] = { client_id: p.client_id, name: p.name }; });
        const cIds = Array.from(new Set((projs || []).map((p: any) => p.client_id)));
        if (cIds.length) {
          const { data: cls } = await sb.from("clients").select("id, business_name, contact_name").in("id", cIds);
          (cls || []).forEach((c: any) => { clientMap[c.id] = c.business_name || c.contact_name || "Untitled"; });
        }
      }
      // For pending invoices/proposals
      const pendClientIds = Array.from(new Set([
        ...(invoicesUnpaidRes.data || []).map((r: any) => r.client_id),
        ...(approvalsPendRes.data || []).map((r: any) => r.client_id),
      ].filter(Boolean)));
      if (pendClientIds.length) {
        const { data: cls } = await sb.from("clients").select("id, business_name, contact_name").in("id", pendClientIds);
        (cls || []).forEach((c: any) => { clientMap[c.id] = c.business_name || c.contact_name || "Untitled"; });
      }

      const mrr_cents = (invoicesPaidRes.data || []).reduce((s: number, r: any) => s + (r.amount_cents || 0), 0);
      const outstanding_cents = (invoicesUnpaidRes.data || []).reduce((s: number, r: any) => s + (r.amount_cents || 0), 0);

      return json({
        kpis: {
          active_clients: clientsRes.count || 0,
          active_subscriptions: subsActiveRes.count || 0,
          active_projects: projectsRes.count || 0,
          open_tasks: tasksOpenRes.count || 0,
          overdue_tasks: tasksOverdueRes.count || 0,
          pending_proposals: approvalsPendRes.count || 0,
          unpaid_invoices: invoicesUnpaidRes.count || 0,
        },
        revenue: { paid_30d_cents: mrr_cents, outstanding_cents },
        activity: activityRes.data || [],
        upcoming: (upcomingRes.data || []).map((t: any) => ({
          ...t,
          project_name: projMap[t.client_project_id]?.name || null,
          client_id: projMap[t.client_project_id]?.client_id || null,
          client_name: clientMap[projMap[t.client_project_id]?.client_id || ""] || null,
        })),
        recent_clients: recentClientsRes.data || [],
        pending_proposals: (approvalsPendRes.data || []).map((p: any) => ({
          ...p, client_name: clientMap[p.client_id] || null,
        })),
        pending_invoices: (invoicesUnpaidRes.data || []).map((i: any) => ({
          ...i, client_name: clientMap[i.client_id] || null,
        })),
      });
    }

    return json({ error: "Not found" }, 404);
  } catch (e) {
    console.error("admin-dashboard error", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
