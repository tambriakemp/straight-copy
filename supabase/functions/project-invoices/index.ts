// Project invoices edge function.
// Actions:
//   admin: list, schedule, send, void, delete
//   public: portal-active (by clientId)
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SURECART_API = "https://api.surecart.com/v1";

const COLS =
  "id, client_id, client_project_id, sequence, label, amount_cents, currency, due_date, status, " +
  "surecart_checkout_id, surecart_invoice_id, surecart_order_id, checkout_url, " +
  "sent_at, paid_at, voided_at, notes, created_at, updated_at";

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
  z.object({
    action: z.literal("schedule"),
    clientId: z.string().uuid(),
    clientProjectId: z.string().uuid(),
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
  z.object({ action: z.literal("void"), clientId: z.string().uuid(), invoiceId: z.string().uuid() }),
  z.object({ action: z.literal("delete"), clientId: z.string().uuid(), invoiceId: z.string().uuid() }),
  z.object({ action: z.literal("portal-active"), clientId: z.string().uuid() }),
  z.object({ action: z.literal("portal-schedule"), clientId: z.string().uuid() }),
]);

const ADMIN_ONLY = new Set(["list", "schedule", "send", "payment-link", "void", "delete"]);

const checkoutIdFrom = (checkout: unknown) =>
  typeof checkout === "string" ? checkout :
  checkout && typeof checkout === "object" && "id" in checkout ? String((checkout as { id?: string }).id ?? "") || null :
  null;

async function surecart(path: string, init: RequestInit) {
  const token = Deno.env.get("SURECART_API_TOKEN");
  if (!token) throw new Error("SURECART_API_TOKEN not configured");
  const r = await fetch(`${SURECART_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!r.ok) {
    const msg = body?.message || body?.error || `SureCart ${r.status}`;
    throw new Error(`SureCart API ${path} failed [${r.status}]: ${msg}`);
  }
  return body;
}

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

    if (input.action === "schedule") {
      const { data: existing } = await supabase.from("project_invoices")
        .select("id, status")
        .eq("client_project_id", input.clientProjectId);
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
      return respond({ success: true });
    }

    if (input.action === "send") {
      const { data: row, error } = await supabase.from("project_invoices").select(COLS)
        .eq("id", input.invoiceId).eq("client_id", input.clientId).maybeSingle();
      if (error) throw error;
      if (!row) return respond({ error: "Invoice not found" }, 404);
      if (row.status !== "scheduled" && row.status !== "failed") {
        return respond({ error: `Cannot send invoice in status ${row.status}` }, 409);
      }

      const { data: client } = await supabase.from("clients")
        .select("id, contact_email, contact_name, surecart_customer_id, business_name")
        .eq("id", input.clientId).maybeSingle();
      if (!client) return respond({ error: "Client not found" }, 404);

      try {
        const priceId = input.priceId || Deno.env.get("SURECART_CUSTOM_PRICE_ID");
        if (!priceId) {
          return respond({ error: "SURECART_CUSTOM_PRICE_ID not configured" }, 500);
        }
        if (!client.contact_email && !client.surecart_customer_id) {
          return respond({ error: "Client is missing a contact email" }, 400);
        }

        // 1. Ensure a SureCart customer exists for this client.
        let customerId = client.surecart_customer_id as string | null;
        if (!customerId) {
          const customerBody: any = {
            customer: {
              email: client.contact_email,
              name: client.contact_name || client.business_name || client.contact_email,
            },
          };
          const created = await surecart("/customers", {
            method: "POST",
            body: JSON.stringify(customerBody),
          });
          customerId = created.id;
          await supabase.from("clients")
            .update({ surecart_customer_id: customerId })
            .eq("id", client.id);
        }

        // 2. Create the draft invoice (SureCart auto-creates a paired checkout).
        const dueDate = input.dueDate ?? row.due_date;
        const invoiceBody: any = {
          invoice: {
            notifications_enabled: true,
            metadata: {
              project_invoice_id: row.id,
              client_id: client.id,
              project_id: row.client_project_id,
            },
          },
        };
        if (dueDate) {
          invoiceBody.invoice.due_date = Math.floor(new Date(dueDate).getTime() / 1000);
        }
        const invoice = await surecart("/invoices", {
          method: "POST",
          body: JSON.stringify(invoiceBody),
        });
        const invoiceCheckoutId = checkoutIdFrom(invoice.checkout);
        if (!invoiceCheckoutId) throw new Error("SureCart did not create an invoice checkout");

        // 3. Add the ad-hoc line item to the invoice's checkout.
        await surecart("/line_items", {
          method: "POST",
          body: JSON.stringify({
            line_item: {
              checkout: invoiceCheckoutId,
              price: priceId,
              quantity: 1,
              ad_hoc_amount: row.amount_cents,
            },
          }),
        });

        // 4. Attach the customer + metadata to the checkout.
        const checkout = await surecart(`/checkouts/${invoiceCheckoutId}`, {
          method: "PATCH",
          body: JSON.stringify({
            checkout: {
              customer: customerId,
              metadata: {
                project_invoice_id: row.id,
                client_id: client.id,
                project_id: row.client_project_id,
                label: row.label,
              },
            },
          }),
        });

        // 5. Open (finalize) the invoice so it has a public hosted URL.
        const openedInvoice = await surecart(`/invoices/${invoice.id}/open`, {
          method: "PATCH",
        });

        const payUrl = openedInvoice.portal_url || invoice.portal_url || checkout.portal_url || null;
        const { error: upErr } = await supabase.from("project_invoices").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          surecart_checkout_id: checkoutIdFrom(openedInvoice.checkout) || checkout.id || invoiceCheckoutId,
          surecart_invoice_id: openedInvoice.id || invoice.id,
          checkout_url: payUrl,
        }).eq("id", row.id);
        if (upErr) throw upErr;

        return respond({ success: true, checkoutUrl: payUrl, invoiceId: openedInvoice.id || invoice.id });
      } catch (e) {
        await supabase.from("project_invoices").update({
          status: "failed",
          notes: (row.notes ?? "") + `\n[send error ${new Date().toISOString()}] ${e instanceof Error ? e.message : "Unknown"}`,
        }).eq("id", row.id);
        throw e;
      }
    }

    if (input.action === "payment-link") {
      const { data: row, error } = await supabase.from("project_invoices").select(COLS)
        .eq("id", input.invoiceId).eq("client_id", input.clientId).maybeSingle();
      if (error) throw error;
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
      const { data, error } = await supabase.from("project_invoices")
        .select("id, sequence, label, amount_cents, currency, due_date, status, checkout_url, sent_at")
        .eq("client_id", input.clientId)
        .eq("status", "sent")
        .order("sequence", { ascending: true })
        .limit(1);
      if (error) throw error;
      return respond({ invoice: data?.[0] ?? null });
    }

    if (input.action === "portal-schedule") {
      // Return all non-deleted invoices for this client across their app development projects,
      // grouped by project. Read-only — clients see status + paylink only.
      const { data: projects } = await supabase
        .from("client_projects")
        .select("id, name, type")
        .eq("client_id", input.clientId)
        .eq("type", "app_development");
      const projectIds = (projects ?? []).map((p: any) => p.id);
      if (!projectIds.length) return respond({ projects: [] });

      const { data: invoices, error } = await supabase
        .from("project_invoices")
        .select("id, client_project_id, sequence, label, amount_cents, currency, due_date, status, checkout_url, sent_at, paid_at")
        .in("client_project_id", projectIds)
        .order("sequence", { ascending: true });
      if (error) throw error;

      const byProject = (projects ?? []).map((p: any) => ({
        projectId: p.id,
        projectName: p.name,
        invoices: (invoices ?? []).filter((i: any) => i.client_project_id === p.id),
      })).filter((p) => p.invoices.length > 0);

      return respond({ projects: byProject });
    }
  } catch (e) {
    console.error("[project-invoices] error:", e);
    return respond({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
