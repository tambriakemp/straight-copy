import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import {
  generateProgressSummary,
  getWeeklyWindow,
  renderProgressReportHtml,
  sendProgressReportEmail,
  type CompletedTaskForSummary,
} from "../_shared/progress-report-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { projectId, forceSend, preview } = await req.json();
    if (!projectId || typeof projectId !== "string") {
      return json({ ok: false, error: "projectId is required" }, 400);
    }
    const isPreview = preview === true;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Load project + client
    const { data: project, error: projErr } = await sb
      .from("client_projects")
      .select("id, client_id, name, type, primary_contact_id, progress_report_enabled, progress_report_recipient_ids")
      .eq("id", projectId)
      .maybeSingle();
    if (projErr || !project) return json({ ok: false, error: "Project not found" }, 404);

    if (!project.progress_report_enabled && !forceSend && !isPreview) {
      return json({ ok: true, skipped: "disabled" });
    }

    const { data: client } = await sb
      .from("clients")
      .select("id, business_name, contact_name, contact_email, contact_phone")
      .eq("id", project.client_id)
      .maybeSingle();

    // 2. Resolve recipients
    let recipientIds: string[] = (project.progress_report_recipient_ids as string[] | null) ?? [];
    if (recipientIds.length === 0 && project.primary_contact_id) {
      recipientIds = [project.primary_contact_id as string];
    }

    const recipients: Array<{ email: string; name: string | null; phone: string | null }> = [];
    if (recipientIds.length > 0) {
      const { data: cs } = await sb
        .from("client_contacts")
        .select("id, name, email, phone")
        .in("id", recipientIds);
      for (const c of cs ?? []) {
        if ((c as any).email) recipients.push({ email: (c as any).email, name: (c as any).name, phone: (c as any).phone });
      }
    }
    // Fall back to client-level email if still empty
    if (recipients.length === 0 && client?.contact_email) {
      recipients.push({ email: client.contact_email, name: client.contact_name, phone: client.contact_phone });
    }

    // Always copy admin
    const adminEmail = Deno.env.get("PROGRESS_REPORT_ADMIN_EMAIL") || "tambria@cre8visions.com";
    if (!recipients.some((r) => r.email.toLowerCase() === adminEmail.toLowerCase())) {
      recipients.push({ email: adminEmail, name: "Tambria Kemp", phone: null });
    }

    // 3. Compute the weekly window and pull completed tasks
    const window = getWeeklyWindow(new Date());

    const { data: taskRows, error: taskErr } = await sb
      .from("project_tasks")
      .select("id, name, description, epic_id, updated_at, status")
      .eq("client_project_id", projectId)
      .eq("status", "complete")
      .gte("updated_at", window.start.toISOString())
      .lt("updated_at", window.end.toISOString());
    if (taskErr) return json({ ok: false, error: taskErr.message }, 500);

    const tasks = taskRows ?? [];
    if (tasks.length === 0) {
      if (isPreview) {
        return json({ ok: true, preview: true, skipped: "no_tasks_completed", period: window.label });
      }
      await sb.from("project_progress_reports").insert({
        client_project_id: projectId,
        period_start: window.start.toISOString(),
        period_end: window.end.toISOString(),
        task_ids: [],
        recipients: recipients.map((r) => r.email),
        error: "no_tasks_completed",
      } as never);
      return json({ ok: true, skipped: "no_tasks_completed" });
    }

    // Resolve epic names
    const epicIds = Array.from(new Set(tasks.map((t) => (t as any).epic_id).filter(Boolean))) as string[];
    let epicMap = new Map<string, string>();
    if (epicIds.length > 0) {
      const { data: epics } = await sb
        .from("project_task_epics")
        .select("id, name")
        .in("id", epicIds);
      epicMap = new Map((epics ?? []).map((e) => [(e as any).id, (e as any).name]));
    }

    const summaryInput: CompletedTaskForSummary[] = tasks.map((t) => ({
      id: (t as any).id,
      name: (t as any).name,
      description: (t as any).description,
      epic_name: (t as any).epic_id ? (epicMap.get((t as any).epic_id) ?? null) : null,
      completed_at: (t as any).updated_at,
    }));

    // 4. Generate AI summary
    let summary;
    try {
      summary = await generateProgressSummary(summaryInput, project.name as string, window.label);
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      await sb.from("project_progress_reports").insert({
        client_project_id: projectId,
        period_start: window.start.toISOString(),
        period_end: window.end.toISOString(),
        task_ids: tasks.map((t) => (t as any).id),
        recipients: recipients.map((r) => r.email),
        error: `ai_failed: ${err}`.slice(0, 1000),
      } as never);
      return json({ ok: false, error: err }, 500);
    }

    const portalUrl = `https://cre8visions.com/portal/${project.client_id}`;
    const subject = `${project.name} — Weekly Progress (${window.label})`;

    // 5. Send to each recipient
    const sendResults: Array<{ email: string; ok: boolean; error?: string }> = [];
    for (const r of recipients) {
      const html = renderProgressReportHtml({
        projectName: project.name as string,
        businessName: client?.business_name ?? null,
        contactName: r.name,
        periodLabel: window.label,
        summary,
        portalUrl,
        taskCount: tasks.length,
      });
      const res = await sendProgressReportEmail({
        recipient: { email: r.email, name: r.name, company: client?.business_name ?? null, phone: r.phone },
        subject,
        html,
        tags: ["weekly_progress_report"],
        mergeFields: {
          project_name: project.name,
          business_name: client?.business_name,
          period_label: window.label,
        },
      });
      sendResults.push({ email: r.email, ok: res.ok, error: res.error });
    }

    const anySent = sendResults.some((r) => r.ok);
    const errorSummary = sendResults.filter((r) => !r.ok).map((r) => `${r.email}: ${r.error}`).join("; ") || null;

    // 6. Persist log
    await sb.from("project_progress_reports").insert({
      client_project_id: projectId,
      period_start: window.start.toISOString(),
      period_end: window.end.toISOString(),
      summary_markdown: `${summary.overview}\n\n${summary.bullets.map((b) => `- ${b}`).join("\n")}`,
      task_ids: tasks.map((t) => (t as any).id),
      recipients: sendResults.filter((r) => r.ok).map((r) => r.email),
      sent_at: anySent ? new Date().toISOString() : null,
      error: errorSummary,
    } as never);

    if (anySent) {
      await sb
        .from("client_projects")
        .update({ progress_report_last_sent_at: new Date().toISOString() } as never)
        .eq("id", projectId);
    }

    return json({
      ok: anySent,
      recipients: sendResults.filter((r) => r.ok).map((r) => r.email),
      failures: sendResults.filter((r) => !r.ok),
      taskCount: tasks.length,
      period: window.label,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return json({ ok: false, error: msg }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
