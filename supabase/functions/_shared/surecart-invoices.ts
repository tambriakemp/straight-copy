// SureCart invoice sending, shared between project-invoices (admin-triggered
// sends) and proposal-sign (the automatic deposit invoice on signature).
//
// Pulled out rather than invoked cross-function: project-invoices' `send`
// action is admin-only and checks the caller's JWT, and proposal-sign runs as
// a public endpoint with no admin session to forward. Calling the HTTP
// function from here would just 403 against itself. This talks to the DB and
// SureCart directly instead, so either caller can use it under its own auth
// rules.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

const SURECART_API = "https://api.surecart.com/v1";

export const checkoutIdFrom = (checkout: unknown) =>
  typeof checkout === "string" ? checkout :
  checkout && typeof checkout === "object" && "id" in checkout ? String((checkout as { id?: string }).id ?? "") || null :
  null;

export async function surecart(path: string, init: RequestInit) {
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

export interface SendProjectInvoiceResult {
  checkoutUrl: string | null;
  invoiceId: string;
}

/**
 * Sends one project_invoices row through SureCart: ensures a customer,
 * creates the draft invoice + ad-hoc line item, attaches the customer, and
 * opens it for a public pay link. Updates the row to `sent` on success, or
 * `failed` (with the error appended to notes) on failure — same contract as
 * the `send` action in project-invoices.
 */
export async function sendProjectInvoice(
  supabase: SupabaseClient,
  opts: { invoiceId: string; clientId: string; priceId?: string | null; dueDate?: string | null },
): Promise<SendProjectInvoiceResult> {
  const COLS =
    "id, client_id, client_project_id, sequence, label, amount_cents, currency, due_date, status, notes";
  const { data: row, error } = await supabase.from("project_invoices").select(COLS)
    .eq("id", opts.invoiceId).eq("client_id", opts.clientId).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("Invoice not found");
  if (row.status !== "scheduled" && row.status !== "failed") {
    throw new Error(`Cannot send invoice in status ${row.status}`);
  }

  const { data: client } = await supabase.from("clients")
    .select("id, contact_email, contact_name, surecart_customer_id, business_name")
    .eq("id", opts.clientId).maybeSingle();
  if (!client) throw new Error("Client not found");

  try {
    const priceId = opts.priceId || Deno.env.get("SURECART_CUSTOM_PRICE_ID");
    if (!priceId) throw new Error("SURECART_CUSTOM_PRICE_ID not configured");
    if (!client.contact_email && !client.surecart_customer_id) {
      throw new Error("Client is missing a contact email");
    }

    let customerId = client.surecart_customer_id as string | null;
    if (!customerId) {
      const email = (client.contact_email || "").trim().toLowerCase();
      const rawName = (client.contact_name || client.business_name || "").trim();
      const parts = rawName ? rawName.split(/\s+/) : [];
      const firstName = parts[0] || (email ? email.split("@")[0] : "Customer");
      const lastName = parts.slice(1).join(" ") || (client.business_name || "").trim() || "—";

      try {
        const existing = await surecart(`/customers?query=${encodeURIComponent(email)}`, { method: "GET" });
        const match = (existing?.data ?? []).find((c: any) => (c.email || "").toLowerCase() === email);
        if (match?.id) customerId = match.id;
      } catch { /* ignore lookup failure, fall through to create */ }

      if (!customerId) {
        const created = await surecart("/customers", {
          method: "POST",
          body: JSON.stringify({
            customer: {
              email,
              first_name: firstName,
              last_name: lastName,
              name: rawName || `${firstName} ${lastName}`.trim(),
            },
          }),
        });
        customerId = created.id;
      }

      await supabase.from("clients").update({ surecart_customer_id: customerId }).eq("id", client.id);
    }

    const dueDate = opts.dueDate ?? row.due_date;
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
    if (dueDate) invoiceBody.invoice.due_date = Math.floor(new Date(dueDate).getTime() / 1000);
    const invoice = await surecart("/invoices", { method: "POST", body: JSON.stringify(invoiceBody) });
    const invoiceCheckoutId = checkoutIdFrom(invoice.checkout);
    if (!invoiceCheckoutId) throw new Error("SureCart did not create an invoice checkout");

    const { data: proj } = await supabase.from("client_projects")
      .select("name").eq("id", row.client_project_id).maybeSingle();
    const projectName = proj?.name || "Project";

    await surecart("/line_items", {
      method: "POST",
      body: JSON.stringify({
        line_item: {
          checkout: invoiceCheckoutId,
          price: priceId,
          quantity: 1,
          ad_hoc_amount: row.amount_cents,
          ad_hoc_name: row.label,
          ad_hoc_description: `${projectName} — ${row.label}`,
        },
      }),
    });

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

    const openedInvoice = await surecart(`/invoices/${invoice.id}/open`, { method: "PATCH" });

    const payUrl = openedInvoice.portal_url || invoice.portal_url || checkout.portal_url || null;
    const { error: upErr } = await supabase.from("project_invoices").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      surecart_checkout_id: checkoutIdFrom(openedInvoice.checkout) || checkout.id || invoiceCheckoutId,
      surecart_invoice_id: openedInvoice.id || invoice.id,
      checkout_url: payUrl,
    }).eq("id", row.id);
    if (upErr) throw upErr;

    return { checkoutUrl: payUrl, invoiceId: openedInvoice.id || invoice.id };
  } catch (e) {
    await supabase.from("project_invoices").update({
      status: "failed",
      notes: (row.notes ?? "") + `\n[send error ${new Date().toISOString()}] ${e instanceof Error ? e.message : "Unknown"}`,
    }).eq("id", row.id);
    throw e;
  }
}
