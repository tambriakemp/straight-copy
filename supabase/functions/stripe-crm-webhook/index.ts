// Stripe → the CRM, for the social plan.
//
// Deliberately NOT the existing stripe-webhook, which serves the ventures
// revenue pipeline and writes only revenue_entries / funnel_events. Two
// separate endpoints with two separate signing secrets means a leak of the
// reporting secret cannot create clients, and a leak of this one cannot forge
// revenue. They share the verifier and nothing else.
//
// Public (verify_jwt = false). Stripe sends a signature header, not a JWT.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { verifyStripeSignature } from "../_shared/stripe/signature.ts";
import {
  normalizeSignup, projectSettings, intakeData, type SignupInput,
} from "../_shared/social/signup.ts";
import { welcomeHtml, welcomeSubject } from "../_shared/social/onboarding-email.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}
type Sb = ReturnType<typeof serviceClient>;

const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://cre8visions.com").replace(/\/$/, "");
const FROM_NAME = "Cre8 Visions";
const FROM_DOMAIN = "cre8visions.com";
const SENDER_DOMAIN = "notify.cre8visions.com";

type Obj = Record<string, unknown>;
const str = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

/** Mirror a subscription's state onto the client and every marketing project. */
async function mirrorStatus(
  sb: Sb,
  match: { subscriptionId?: string | null; customerId?: string | null },
  status: string,
): Promise<string | null> {
  let query = sb.from("clients").select("id").limit(1);
  if (match.subscriptionId) query = query.eq("stripe_subscription_id", match.subscriptionId);
  else if (match.customerId) query = query.eq("stripe_customer_id", match.customerId);
  else return null;

  const { data: client } = await query.maybeSingle();
  if (!client) return null;

  await sb.from("clients").update({ subscription_status: status }).eq("id", client.id);

  // Also onto the project, because that is what the dispatcher checks before
  // every send — it should not have to join back to the client on each row.
  await sb.from("client_projects")
    .update({ subscription_status: status })
    .eq("client_id", client.id).eq("type", "marketing");

  return client.id as string;
}

/** Queue a client email through the ordinary path, so it lands in the send log. */
async function queueEmail(
  sb: Sb,
  args: { to: string; subject: string; html: string; label: string; idempotencyKey: string },
): Promise<void> {
  const messageId = crypto.randomUUID();
  await sb.from("email_send_log").insert({
    message_id: messageId,
    template_name: args.label,
    recipient_email: args.to,
    status: "pending",
  });
  await sb.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to: args.to,
      from: `${FROM_NAME} <noreply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject: args.subject.slice(0, 180),
      html: args.html,
      purpose: "transactional",
      label: args.label,
      idempotency_key: args.idempotencyKey,
      queued_at: new Date().toISOString(),
    },
  });
}

/** Everything that happens once the money is real. */
async function provision(sb: Sb, session: Obj): Promise<Obj> {
  const signupId = str((session.metadata as Obj | undefined)?.signup_id) ??
    str(session.client_reference_id);
  if (!signupId) return { skipped: "no signup_id on the session" };

  const { data: signup } = await sb.from("social_signups")
    .select("*").eq("id", signupId).maybeSingle();
  if (!signup) return { skipped: "signup not found" };

  // Idempotency. Stripe redelivers, and provisioning twice would mean two
  // clients, two projects and two welcome emails.
  if (signup.status === "provisioned") {
    return { skipped: "already provisioned", client_id: signup.client_id };
  }

  const s = normalizeSignup(signup.answers as SignupInput);
  const customerId = str(session.customer);
  const subscriptionId = str(session.subscription);

  // Match an existing client by email before creating one — someone who
  // already bought a build should not become a second client row.
  const { data: found } = await sb.from("clients")
    .select("id").ilike("contact_email", s.email).eq("archived", false)
    .limit(1).maybeSingle();

  let clientId = found?.id as string | undefined;

  const clientFields = {
    tier: "social",
    payment_provider: "stripe",
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    subscription_status: "active",
    intake_data: intakeData(s),
    // Auto-approved: the brand voice is written from answers the client just
    // gave us, and the new-client hold means their first posts wait for a
    // human anyway. Left false, Iris writes generically forever, because the
    // only thing that flips it is an agency click on a task.
    brand_voice_approved: true,
    brand_voice_approved_at: new Date().toISOString(),
  };

  if (clientId) {
    await sb.from("clients").update(clientFields).eq("id", clientId);
  } else {
    const { data: created, error } = await sb.from("clients").insert({
      ...clientFields,
      contact_email: s.email,
      contact_name: s.contact_name,
      business_name: s.business_name,
      contact_phone: s.phone,
      pipeline_stage: "intake_submitted",
      purchased_at: new Date().toISOString(),
    }).select("id").maybeSingle();
    if (error || !created) return { error: error?.message ?? "could not create client" };
    clientId = created.id as string;
  }

  // The project. trg_hold_new_marketing_project pins agent_autonomy to
  // act_in_app on insert, so Iris's first posts for this client wait.
  const projectName = `${s.business_name ?? s.contact_name ?? "Social"} — Social Media`;
  const { data: project, error: projErr } = await sb.from("client_projects").insert({
    client_id: clientId,
    type: "marketing",
    name: projectName,
    status: "active",
    timezone: s.timezone,
    subscription_status: "active",
    social_settings: projectSettings(s),
    source_order_id: str(session.id),
    notes: "Created from the social plan signup.",
  }).select("id").maybeSingle();
  if (projErr || !project) return { error: projErr?.message ?? "could not create project" };
  const projectId = project.id as string;

  // The social journey. Seeded explicitly rather than left to the tier trigger:
  // that one only fires on UPDATE of tier and never sets client_project_id.
  const { data: templates } = await sb.from("journey_templates")
    .select("id, key, label, order_index, checklist").eq("tier", "social");
  if (templates?.length) {
    await sb.from("journey_nodes").upsert(
      templates.map((t) => ({
        client_id: clientId,
        client_project_id: projectId,
        template_id: t.id,
        key: t.key,
        label: t.label,
        order_index: t.order_index,
        checklist: t.checklist,
      })),
      { onConflict: "client_id,key", ignoreDuplicates: true },
    );
  }

  // The board. ensure_intake_tasks_for_project walks the intake node's
  // checklist and creates one task per item, mapping owner -> assignee_kind —
  // so the agency items land as 'agency' and the client's as 'client' without
  // a second list to keep in step with the journey.
  await sb.rpc("ensure_intake_tasks_for_project", { _client_project_id: projectId });

  // The agent's display name, read rather than written in: four of the six
  // have been renamed, and a task that says "Iris chases the client" is wrong
  // the moment she is called something else — silently, because it still
  // renders.
  const { data: socialAgent } = await sb.from("agents")
    .select("name").eq("key", "social-media").maybeSingle();
  const who = (socialAgent?.name as string | undefined) ?? "the social media manager";

  // One task needs context the checklist label cannot carry: which invite to
  // send, and which accounts this client actually has.
  await sb.from("project_tasks").update({
    priority: "high",
    description:
      `Create the CoPost project, invite ${s.email}, create a trigger, and paste ` +
      `its URL into the project's Settings tab.\n\n` +
      `Accounts they said they have: ${s.channels.join(", ") || "none stated"}.\n\n` +
      `Nothing can post until that URL is saved. ${who} chases the client to accept ` +
      `the invite once it is, and stops after three attempts.`,
  }).eq("client_project_id", projectId).eq("journey_item_key", "intake.copost_provisioned");

  // Brand voice, fire-and-forget. It reads clients.intake_data, which was set
  // above, so it has something to work from.
  sb.functions.invoke("generate-brand-voice", { body: { clientId } })
    .catch((e: unknown) => console.error("brand voice invoke failed", e));

  await queueEmail(sb, {
    to: s.email,
    subject: welcomeSubject(s.business_name),
    html: welcomeHtml({
      contactName: s.contact_name,
      businessName: s.business_name,
      portalUrl: `${SITE_URL}/portal/${clientId}`,
      channels: s.channels,
    }),
    label: "social-welcome",
    idempotencyKey: `social-welcome-${signupId}`,
  });

  await sb.from("social_signups").update({
    status: "provisioned",
    client_id: clientId,
    client_project_id: projectId,
    completed_at: new Date().toISOString(),
    stripe_session_id: str(session.id) ?? signup.stripe_session_id,
  }).eq("id", signupId);

  return { ok: true, client_id: clientId, client_project_id: projectId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const secret = Deno.env.get("STRIPE_CRM_WEBHOOK_SECRET") ?? "";
  const rawBody = await req.text();
  const ok = await verifyStripeSignature(rawBody, req.headers.get("stripe-signature"), secret);
  if (!ok) return json({ error: "bad signature" }, 401);

  let event: Obj;
  try {
    event = JSON.parse(rawBody) as Obj;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const type = str(event.type) ?? "";
  const obj = ((event.data as Obj | undefined)?.object ?? {}) as Obj;
  const sb = serviceClient();

  try {
    switch (type) {
      case "checkout.session.completed": {
        // A session can complete unpaid when the payment method needs more
        // time. Provisioning then would hand over the service before the money
        // arrived; invoice.paid brings it back.
        if (obj.payment_status && obj.payment_status !== "paid") {
          return json({ ok: true, ignored: "checkout not paid" });
        }
        return json(await provision(sb, obj));
      }

      case "invoice.paid": {
        const id = await mirrorStatus(sb, {
          subscriptionId: str(obj.subscription),
          customerId: str(obj.customer),
        }, "active");
        return json({ ok: true, client_id: id, status: "active" });
      }

      case "invoice.payment_failed": {
        // Posting pauses here. Nothing is deleted — the calendar and every
        // photo stay exactly where they are, and a successful retry resumes it.
        const id = await mirrorStatus(sb, {
          subscriptionId: str(obj.subscription),
          customerId: str(obj.customer),
        }, "past_due");
        return json({ ok: true, client_id: id, status: "past_due" });
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const status = type.endsWith(".deleted")
          ? "canceled"
          : str(obj.status) ?? "active";
        const id = await mirrorStatus(sb, {
          subscriptionId: str(obj.id),
          customerId: str(obj.customer),
        }, status);
        return json({ ok: true, client_id: id, status });
      }

      default:
        return json({ ok: true, ignored: type });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("stripe-crm-webhook failed", type, message);
    // 500 so Stripe retries. Everything here is idempotent, so a retry is safe.
    return json({ error: message }, 500);
  }
});
