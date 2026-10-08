// Project invoices edge function.
// Actions:
//   admin: list, schedule, send, void, delete
//   public: portal-active (by clientId)
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "zod";
import { sendProjectInvoice, surecart, checkoutIdFrom } from "../_shared/surecart-invoices.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const COLS =
  "id, client_id, client_project_id, schedule_id, proposal_id, sequence, label, amount_cents, currency, " +
  "trigger, due_days, due_date, status, " +
  "surecart_checkout_id, surecart_invoice_id, surecart_order_id, checkout_url, " +
  "sent_at, paid_at, voided_at, notes, created_at, updated_at";

interface ProjectInvoiceRow {
  id: string;
  client_id: string;
  client_project_id: string;
  schedule_id: string | null;
  proposal_id: string | null;
  sequence: number;
  label: string;
  amount_cents: number;
  currency: string;
  trigger: string | null;
  due_days: number | null;
  due_date: string | null;
  status: string;
  surecart_checkout_id: string | null;
  surecart_invoice_id: string | null;
  surecart_order_id: string | null;
  checkout_url: string | null;
  sent_at: string | null;
  paid_at: string | null;
  voided_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const SCHEDULE_COLS =
  "id, client_id, client_project_id, proposal_id, title, total_cents, currency, status, source, created_at, updated_at";

async function isCallerAdmin(req: Request, supabase: any): Promise<boolean> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  try {
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return false;
    const { data } = await supabase
      .from("admin_users").select("id").eq("user_id", user.id).maybeSingle();
    return !!data;
  } catch { return false; }
}

const ScheduleItem = z.object({
  id: z.string().uuid().optional(),
  sequence: z.number().int().min(1).max(50),
  label: z.string().trim().min(1).max(120),
  amount_cents: z.number().int().min(100).max(100_000_000),
  due_date: z.string().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const Schemas = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), clientId: z.string().uuid(), clientProjectId: z.string().uuid() }),
  z.object({ action: z.literal("list-schedules"), clientId: z.string().uuid(), clientProjectId: z.string().uuid() }),
  z.object({
    action: z.literal("create-schedule"),
    clientId: z.string().uuid(),
    clientProjectId: z.string().uuid(),
    title: z.string().trim().min(1).max(120).default("Payment schedule"),
    proposalId: z.string().uuid().nullable().optional(),
    items: z.array(ScheduleItem).max(50).default([]),
  }),
  z.object({
    action: z.literal("schedule"),
    clientId: z.string().uuid(),
    clientProjectId: z.string().uuid(),
    scheduleId: z.string().uuid(),
    items: z.array(ScheduleItem).min(1).max(50),
  }),
  z.object({
    action: z.literal("send"),
    clientId: z.string().uuid(),
    invoiceId: z.string().uuid(),
    priceId: z.string().trim().min(3).max(80).optional(),
    dueDate: z.string().nullable().optional(),
  }),
  z.object({ action: z.literal("payment-link"), clientId: z.string().uuid(), invoiceId: z.string().uuid() }),
  z.object({
    action: z.literal("email-payment-link"),
    clientId: z.string().uuid(),
    invoiceId: z.string().uuid(),
    contactIds: z.array(z.string().uuid()).default([]),
    additionalEmails: z.array(z.string().email()).default([]),
    message: z.string().max(2000).optional(),
  }),
  z.object({ action: z.literal("void"), clientId: z.string().uuid(), invoiceId: z.string().uuid() }),
  z.object({ action: z.literal("delete"), clientId: z.string().uuid(), invoiceId: z.string().uuid() }),
  z.object({ action: z.literal("portal-active"), clientId: z.string().uuid() }),
  z.object({ action: z.literal("portal-schedule"), clientId: z.string().uuid() }),
]);

const ADMIN_ONLY = new Set([
  "list", "list-schedules", "create-schedule", "schedule",
  "send", "payment-link", "email-payment-link", "void", "delete",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const respond = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const parsed = Schemas.safeParse(await req.json());
    if (!parsed.success) {
      return respond({ error: "Invalid request", details: parsed.error.flatten() }, 400);
    }
    const input = parsed.data;

    if (ADMIN_ONLY.has(input.action)) {
      const ok = await isCallerAdmin(req, supabase);
      if (!ok) return respond({ error: "Admin only" }, 403);
    }

    if (input.action === "list") {
      const { data, error } = await supabase.from("project_invoices").select(COLS)
        .eq("client_id", input.clientId)
        .eq("client_project_id", input.clientProjectId)
        .order("sequence", { ascending: true });
      if (error) throw error;
      return respond({ invoices: data ?? [] });
    }

    if (input.action === "list-schedules") {
      const { data: schedules, error: schErr } = await supabase.from("payment_schedules")
        .select(SCHEDULE_COLS)
        .eq("client_id", input.clientId).eq("client_project_id", input.clientProjectId)
        .order("created_at", { ascending: true });
      if (schErr) throw schErr;
      const scheduleIds = (schedules ?? []).map((s: any) => s.id);
      const { data: invoices, error: invErr } = scheduleIds.length
        ? await supabase.from("project_invoices").select(COLS).in("schedule_id", scheduleIds).order("sequence", { ascending: true })
        : { data: [], error: null };
      if (invErr) throw invErr;
      const result = (schedules ?? []).map((s: any) => ({
        ...s,
        invoices: (invoices ?? []).filter((i: any) => i.schedule_id === s.id),
      }));
      return respond({ schedules: result });
    }

    if (input.action === "create-schedule") {
      const { data: proj } = await supabase.from("client_projects")
        .select("id, client_id").eq("id", input.clientProjectId).eq("client_id", input.clientId).maybeSingle();
      if (!proj) return respond({ error: "Project not found for this client" }, 404);

      if (input.proposalId) {
        const { data: existingForProposal } = await supabase.from("payment_schedules")
          .select("id").eq("proposal_id", input.proposalId).maybeSingle();
        if (existingForProposal) return respond({ error: "That proposal already has a schedule" }, 409);
      }

      const totalCents = input.items.reduce((s, it) => s + it.amount_cents, 0) || null;
      const { data: schedule, error: schErr } = await supabase.from("payment_schedules").insert({
        client_id: input.clientId,
        client_project_id: input.clientProjectId,
        proposal_id: input.proposalId ?? null,
        title: input.title,
        total_cents: totalCents,
        currency: "usd",
        status: "active",
        source: input.proposalId ? "proposal" : "manual",
      }).select(SCHEDULE_COLS).single();
      if (schErr) throw schErr;

      if (input.items.length) {
        const inserts = input.items.map((it) => ({
          client_id: input.clientId,
          client_project_id: input.clientProjectId,
          schedule_id: schedule.id,
          sequence: it.sequence,
          label: it.label,
          amount_cents: it.amount_cents,
          due_date: it.due_date ?? null,
          notes: it.notes ?? null,
          status: "scheduled",
        }));
        const { error: insErr } = await supabase.from("project_invoices").insert(inserts);
        if (insErr) throw insErr;
      }
      return respond({ success: true, schedule });
    }

    if (input.action === "schedule") {
      const { data: scheduleRow } = await supabase.from("payment_schedules")
        .select("id").eq("id", input.scheduleId)
        .eq("client_id", input.clientId).eq("client_project_id", input.clientProjectId)
        .maybeSingle();
      if (!scheduleRow) return respond({ error: "Schedule not found for this client/project" }, 404);

      // Scoped to this schedule_id only — a second schedule on the same
      // project is a different set of rows and must never be touched by
      // this save, which is the bug this whole action used to have.
      const { data: existing } = await supabase.from("project_invoices")
        .select("id, status")
        .eq("schedule_id", input.scheduleId);
      const lockedIds = new Set((existing ?? []).filter(r => r.status !== "scheduled").map(r => r.id));

      const inserts: any[] = [];
      const updates: any[] = [];
      for (const it of input.items) {
        if (it.id) {
          if (lockedIds.has(it.id)) continue;
          updates.push({
            id: it.id,
            sequence: it.sequence,
            label: it.label,
            amount_cents: it.amount_cents,
            due_date: it.due_date ?? null,
            notes: it.notes ?? null,
          });
        } else {
          inserts.push({
            client_id: input.clientId,
            client_project_id: input.clientProjectId,
            schedule_id: input.scheduleId,
            sequence: it.sequence,
            label: it.label,
            amount_cents: it.amount_cents,
            due_date: it.due_date ?? null,
            notes: it.notes ?? null,
            status: "scheduled",
          });
        }
      }
      const incomingIds = new Set(input.items.filter(i => i.id).map(i => i.id!));
      const deletableIds = (existing ?? [])
        .filter(r => r.status === "scheduled" && !incomingIds.has(r.id))
        .map(r => r.id);
      if (deletableIds.length) {
        await supabase.from("project_invoices").delete().in("id", deletableIds);
      }
      for (const u of updates) {
        const { id, ...rest } = u;
        await supabase.from("project_invoices").update(rest).eq("id", id);
      }
      if (inserts.length) await supabase.from("project_invoices").insert(inserts);

      const { data: freshInvoices } = await supabase.from("project_invoices")
        .select("amount_cents").eq("schedule_id", input.scheduleId);
      const newTotal = (freshInvoices ?? []).reduce((s, r: any) => s + r.amount_cents, 0) || null;
      await supabase.from("payment_schedules").update({ total_cents: newTotal }).eq("id", input.scheduleId);

      return respond({ success: true });
    }

    if (input.action === "send") {
      try {
        const result = await sendProjectInvoice(supabase, {
          invoiceId: input.invoiceId, clientId: input.clientId,
          priceId: input.priceId, dueDate: input.dueDate,
        });
        return respond({ success: true, checkoutUrl: result.checkoutUrl, invoiceId: result.invoiceId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        const status = msg === "Invoice not found" ? 404
          : msg === "Client not found" ? 404
          : msg.startsWith("Cannot send invoice") ? 409
          : 500;
        return respond({ error: msg }, status);
      }
    }

    if (input.action === "payment-link") {
      const { data: rowData, error } = await supabase.from("project_invoices").select(COLS)
        .eq("id", input.invoiceId).eq("client_id", input.clientId).maybeSingle();
      if (error) throw error;
      const row = rowData as ProjectInvoiceRow | null;
      if (!row) return respond({ error: "Invoice not found" }, 404);
      if (!row.surecart_invoice_id) return respond({ checkoutUrl: row.checkout_url ?? null });

      const currentInvoice = await surecart(`/invoices/${row.surecart_invoice_id}`, { method: "GET" });
      const payableInvoice = currentInvoice.status === "draft"
        ? await surecart(`/invoices/${row.surecart_invoice_id}/open`, { method: "PATCH" })
        : currentInvoice;
      const payUrl = payableInvoice.portal_url || row.checkout_url || null;
      const checkoutId = checkoutIdFrom(payableInvoice.checkout) || row.surecart_checkout_id;
      const { error: upErr } = await supabase.from("project_invoices").update({
        status: payableInvoice.status === "void" ? "void" : row.status,
        surecart_checkout_id: checkoutId,
        checkout_url: payUrl,
      }).eq("id", row.id);
      if (upErr) throw upErr;
      return respond({ checkoutUrl: payUrl, invoiceId: payableInvoice.id || row.surecart_invoice_id });
    }

    if (input.action === "email-payment-link") {
      const { data: rowData, error } = await supabase.from("project_invoices").select(COLS)
        .eq("id", input.invoiceId).eq("client_id", input.clientId).maybeSingle();
      if (error) throw error;
      const row = rowData as ProjectInvoiceRow | null;
      if (!row) return respond({ error: "Invoice not found" }, 404);

      // Ensure we have a payable link — open the draft invoice if needed.
      let payUrl = row.checkout_url as string | null;
      if (row.surecart_invoice_id) {
        try {
          const current = await surecart(`/invoices/${row.surecart_invoice_id}`, { method: "GET" });
          const usable = current.status === "draft"
            ? await surecart(`/invoices/${row.surecart_invoice_id}/open`, { method: "PATCH" })
            : current;
          payUrl = usable.portal_url || payUrl;
          if (payUrl && payUrl !== row.checkout_url) {
            await supabase.from("project_invoices").update({ checkout_url: payUrl }).eq("id", row.id);
          }
        } catch (e) {
          console.warn("[email-payment-link] refresh failed:", e);
        }
      }
      if (!payUrl) return respond({ error: "No payment link available for this invoice yet. Send it first." }, 400);

      // Collect recipient list: selected contacts + free-form additional emails.
      const emailToName = new Map<string, string | null>();
      if (input.contactIds.length) {
        const { data: contacts } = await supabase
          .from("client_contacts")
          .select("id, email, name")
          .eq("client_id", input.clientId)
          .in("id", input.contactIds);
        for (const c of contacts ?? []) {
          const e = (c.email || "").trim().toLowerCase();
          if (e) emailToName.set(e, c.name || null);
        }
      }
      for (const raw of input.additionalEmails) {
        const e = (raw || "").trim().toLowerCase();
        if (e && !emailToName.has(e)) emailToName.set(e, null);
      }
      if (emailToName.size === 0) return respond({ error: "No recipients selected" }, 400);

      const { data: proj } = await supabase.from("client_projects")
        .select("name").eq("id", row.client_project_id).maybeSingle();
      const projectName = proj?.name || "your project";

      const amountFormatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: (row.currency || "usd").toUpperCase(),
      }).format(row.amount_cents / 100);
      const dueDateFormatted = row.due_date
        ? new Date(String(row.due_date).length <= 10 ? row.due_date + "T12:00:00" : row.due_date)
            .toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
        : null;

      const results: { email: string; ok: boolean; error?: string }[] = [];
      for (const [email, name] of emailToName) {
        try {
          const { error: sendErr } = await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "invoice-payment-link",
              recipientEmail: email,
              idempotencyKey: `invoice-paylink-${row.id}-${email}-${Date.now()}`,
              templateData: {
                recipientName: name,
                projectName,
                invoiceLabel: row.label,
                amountFormatted,
                dueDateFormatted,
                payUrl,
                fromName: "CRE8 Visions",
              },
            },
          });
          if (sendErr) throw sendErr;
          results.push({ email, ok: true });
        } catch (e) {
          results.push({ email, ok: false, error: e instanceof Error ? e.message : "send failed" });
        }
      }
      const okCount = results.filter(r => r.ok).length;
      return respond({ success: okCount > 0, sent: okCount, results, payUrl });
    }

    if (input.action === "void") {
      const { data: row } = await supabase.from("project_invoices")
        .select("id, status").eq("id", input.invoiceId).eq("client_id", input.clientId).maybeSingle();
      if (!row) return respond({ error: "Not found" }, 404);
      if (row.status === "paid") return respond({ error: "Cannot void paid invoice" }, 409);
      const { error } = await supabase.from("project_invoices")
        .update({ status: "void", voided_at: new Date().toISOString() })
        .eq("id", input.invoiceId);
      if (error) throw error;
      return respond({ success: true });
    }

    if (input.action === "delete") {
      const { data: row } = await supabase.from("project_invoices")
        .select("id, status").eq("id", input.invoiceId).eq("client_id", input.clientId).maybeSingle();
      if (!row) return respond({ error: "Not found" }, 404);
      if (row.status === "paid") return respond({ error: "Cannot delete paid invoice" }, 409);
      const { error } = await supabase.from("project_invoices").delete().eq("id", input.invoiceId);
      if (error) throw error;
      return respond({ success: true });
    }

    if (input.action === "portal-active") {
      // Every currently-payable invoice, not just the first by sequence —
      // a client with two schedules (or a second milestone already sent
      // while an earlier one is still outstanding) needs to see both.
      const { data, error } = await supabase.from("project_invoices")
        .select("id, sequence, label, amount_cents, currency, due_date, status, checkout_url, sent_at")
        .eq("client_id", input.clientId)
        .eq("status", "sent")
        .order("sequence", { ascending: true });
      if (error) throw error;
      return respond({ invoices: data ?? [], invoice: data?.[0] ?? null });
    }

    if (input.action === "portal-schedule") {
      // Every project type, not just app_development — a web_development or
      // any other project with its own payment schedule was invisible to the
      // client before this. Read-only — clients see status + paylink only.
      const { data: projects } = await supabase
        .from("client_projects")
        .select("id, name, type")
        .eq("client_id", input.clientId);
      const projectIds = (projects ?? []).map((p: any) => p.id);
      if (!projectIds.length) return respond({ projects: [] });

      const { data: schedules } = await supabase
        .from("payment_schedules")
        .select("id, client_project_id, title")
        .in("client_project_id", projectIds)
        .order("created_at", { ascending: true });
      const scheduleIds = (schedules ?? []).map((s: any) => s.id);

      const { data: invoices, error } = scheduleIds.length
        ? await supabase
          .from("project_invoices")
          .select("id, client_project_id, schedule_id, sequence, label, amount_cents, currency, due_date, status, checkout_url, sent_at, paid_at")
          .in("schedule_id", scheduleIds)
          .order("sequence", { ascending: true })
        : { data: [], error: null };
      if (error) throw error;

      const byProject = (projects ?? []).map((p: any) => {
        const projectSchedules = (schedules ?? [])
          .filter((s: any) => s.client_project_id === p.id)
          .map((s: any) => ({
            scheduleId: s.id,
            title: s.title,
            invoices: (invoices ?? []).filter((i: any) => i.schedule_id === s.id),
          }))
          .filter((s) => s.invoices.length > 0);
        return { projectId: p.id, projectName: p.name, schedules: projectSchedules };
      }).filter((p) => p.schedules.length > 0);

      return respond({ projects: byProject });
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[project-invoices] error:", e);
    return respond({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
