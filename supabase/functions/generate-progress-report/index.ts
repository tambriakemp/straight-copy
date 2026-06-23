import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import {
  generateProgressReportData,
  getWeeklyWindow,
  renderProgressReportPreviewHtml,
  sendProgressReportEmail,
  type TaskForSummary,
} from "../_shared/progress-report-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { projectId, forceSend, preview, testRecipientEmail } = await req.json();
    if (!projectId || typeof projectId !== "string") {
      return json({ ok: false, error: "projectId is required" }, 400);
    }
    const isPreview = preview === true;
    const testEmail = typeof testRecipientEmail === "string" && testRecipientEmail.includes("@")
      ? testRecipientEmail.trim()
      : null;

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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

    // Resolve recipients
    const recipients: Array<{ email: string; name: string | null; phone: string | null }> = [];
    if (testEmail) {
      // Test send: only this address, skip admin copy
      recipients.push({ email: testEmail, name: null, phone: null });
    } else {
      let recipientIds: string[] = (project.progress_report_recipient_ids as string[] | null) ?? [];
      if (recipientIds.length === 0 && project.primary_contact_id) {
        recipientIds = [project.primary_contact_id as string];
      }
      if (recipientIds.length > 0) {
        const { data: cs } = await sb
          .from("client_contacts")
          .select("id, name, email, phone")
          .in("id", recipientIds);
        for (const c of cs ?? []) {
          if ((c as any).email) recipients.push({ email: (c as any).email, name: (c as any).name, phone: (c as any).phone });
        }
      }
      if (recipients.length === 0 && client?.contact_email) {
        recipients.push({ email: client.contact_email, name: client.contact_name, phone: client.contact_phone });
      }
      const adminEmail = Deno.env.get("PROGRESS_REPORT_ADMIN_EMAIL") || "tambria@cre8visions.com";
      if (!recipients.some((r) => r.email.toLowerCase() === adminEmail.toLowerCase())) {
        recipients.push({ email: adminEmail, name: "Tambria Kemp", phone: null });
      }
    }

    // Weekly window
    const window = getWeeklyWindow(new Date());

    // Pull tasks: completed this week, currently in progress, queued next
    const { data: completedRows, error: cErr } = await sb
      .from("project_tasks")
      .select("id, name, description, epic_id, updated_at, status")
      .eq("client_project_id", projectId)
      .eq("status", "complete")
      .gte("updated_at", window.start.toISOString())
      .lt("updated_at", window.end.toISOString());
    if (cErr) return json({ ok: false, error: cErr.message }, 500);

    const { data: inProgressRows } = await sb
      .from("project_tasks")
      .select("id, name, description, epic_id, updated_at, status")
      .eq("client_project_id", projectId)
      .in("status", ["in_progress", "needs_review", "blocked"])
      .order("updated_at", { ascending: false })
      .limit(12);

    const { data: nextRows } = await sb
      .from("project_tasks")
      .select("id, name, description, epic_id, updated_at, status, order_index")
      .eq("client_project_id", projectId)
      .in("status", ["ready_for_claude", "backlog"])
      .order("order_index", { ascending: true })
      .limit(10);

    const completed = completedRows ?? [];
    const inProgress = inProgressRows ?? [];
    const next = nextRows ?? [];

    if (completed.length === 0 && inProgress.length === 0 && !isPreview) {
      await sb.from("project_progress_reports").insert({
        client_project_id: projectId,
        period_start: window.start.toISOString(),
        period_end: window.end.toISOString(),
        task_ids: [],
        recipients: recipients.map((r) => r.email),
        error: "no_activity",
      } as never);
      return json({ ok: true, skipped: "no_activity" });
    }

    // Epic name lookup across all
    const epicIds = Array.from(
      new Set(
        [...completed, ...inProgress, ...next]
          .map((t) => (t as any).epic_id)
          .filter(Boolean),
      ),
    ) as string[];
    const epicMap = new Map<string, string>();
    if (epicIds.length > 0) {
      const { data: epics } = await sb
        .from("project_task_epics")
        .select("id, name")
        .in("id", epicIds);
      for (const e of epics ?? []) epicMap.set((e as any).id, (e as any).name);
    }

    const shape = (rows: any[]): TaskForSummary[] =>
      rows.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        epic_name: t.epic_id ? (epicMap.get(t.epic_id) ?? null) : null,
        status: t.status,
        updated_at: t.updated_at,
      }));




    const portalUrl = `https://cre8visions.com/portal/${project.client_id}`;

    // Generate report fields via AI
    let reportData;
    try {
      reportData = await generateProgressReportData({
        projectName: project.name as string,
        businessName: client?.business_name ?? null,
        contactName: recipients[0]?.name ?? null,
        periodLabel: window.label,
        weekOf: window.weekOf,
        portalUrl,
        completedTasks: shape(completed),
        inProgressTasks: shape(inProgress),
        nextTasks: shape(next),
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (!isPreview) {
        await sb.from("project_progress_reports").insert({
          client_project_id: projectId,
          period_start: window.start.toISOString(),
          period_end: window.end.toISOString(),
          task_ids: completed.map((t) => (t as any).id),
          recipients: recipients.map((r) => r.email),
          error: `ai_failed: ${err}`.slice(0, 1000),
        } as never);
      }
      return json({ ok: false, error: err }, 500);
    }

    const subject = `${project.name} — Weekly Progress (${window.label})`;

    if (isPreview) {
      const previewHtml = renderProgressReportPreviewHtml(reportData);
      return json({
        ok: true,
        preview: true,
        subject,
        html: previewHtml,
        data: reportData,
        taskCount: completed.length,
        period: window.label,
        recipients: recipients.map((r) => r.email),
      });
    }

    // Send to each recipient (personalize contact_name + greeting per recipient)
    const sendResults: Array<{ email: string; ok: boolean; error?: string }> = [];
    for (const r of recipients) {
      const perRecipient = { ...reportData, contact_name: r.name || reportData.contact_name };
      const res = await sendProgressReportEmail({
        recipient: { email: r.email, name: r.name, company: client?.business_name ?? null, phone: r.phone },
        data: perRecipient,
        tags: ["weekly_progress_report"],
      });
      sendResults.push({ email: r.email, ok: res.ok, error: res.error });
    }

    const anySent = sendResults.some((r) => r.ok);
    const errorSummary = sendResults.filter((r) => !r.ok).map((r) => `${r.email}: ${r.error}`).join("; ") || null;

    await sb.from("project_progress_reports").insert({
      client_project_id: projectId,
      period_start: window.start.toISOString(),
      period_end: window.end.toISOString(),
      summary_markdown: `${reportData.report_intro}\n\nPhase: ${reportData.report_current_phase}\nStatus: ${reportData.report_progress}`,
      task_ids: completed.map((t) => (t as any).id),
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
      taskCount: completed.length,
      period: window.label,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return json({ ok: false, error: msg }, 500);
  }
});
