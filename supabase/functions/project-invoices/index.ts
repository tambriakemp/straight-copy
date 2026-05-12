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
    priceId: z.string().trim().min(3).max(80),
    dueDate: z.string().nullable().optional(),
  }),
  z.object({ action: z.literal("void"), clientId: z.string().uuid(), invoiceId: z.string().uuid() }),
  z.object({ action: z.literal("delete"), clientId: z.string().uuid(), invoiceId: z.string().uuid() }),
  z.object({ action: z.literal("portal-active"), clientId: z.string().uuid() }),
]);

const ADMIN_ONLY = new Set(["list", "schedule", "send", "void", "delete"]);

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
        const checkoutBody: any = {
          checkout: {
            line_items: [{ price: input.priceId, quantity: 1 }],
            metadata: {
              project_invoice_id: row.id,
              client_id: client.id,
              project_id: row.client_project_id,
              label: row.label,
            },
          },
        };
        if (client.surecart_customer_id) {
          checkoutBody.checkout.customer = client.surecart_customer_id;
        } else if (client.contact_email) {
          checkoutBody.checkout.email = client.contact_email;
          if (client.contact_name) {
            const parts = client.contact_name.split(" ");
            checkoutBody.checkout.first_name = parts[0];
            checkoutBody.checkout.last_name = parts.slice(1).join(" ") || null;
          }
        }
        const checkout = await surecart("/checkouts", {
          method: "POST",
          body: JSON.stringify(checkoutBody),
        });

        const dueDate = input.dueDate ?? row.due_date;
        const invoiceBody: any = {
          invoice: {
            checkout: checkout.id,
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

        const payUrl = invoice.portal_url || checkout.portal_url || null;
        const { error: upErr } = await supabase.from("project_invoices").update({
          status: "sent",
          sent_at: new Date().toISOString(),
          surecart_checkout_id: checkout.id,
          surecart_invoice_id: invoice.id,
          checkout_url: payUrl,
        }).eq("id", row.id);
        if (upErr) throw upErr;

        return respond({ success: true, checkoutUrl: payUrl, invoiceId: invoice.id });
      } catch (e) {
        await supabase.from("project_invoices").update({
          status: "failed",
          notes: (row.notes ?? "") + `\n[send error ${new Date().toISOString()}] ${e instanceof Error ? e.message : "Unknown"}`,
        }).eq("id", row.id);
        throw e;
      }
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

    return respond({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[project-invoices] error:", e);
    return respond({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
