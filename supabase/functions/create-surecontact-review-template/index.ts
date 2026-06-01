// Stores the "Site Preview Ready" review email subject + HTML in app_settings.
// SureContact's public API does not expose template create/update (returns 405),
// so we keep the template locally and send it inline through /emails/send.
// The send still goes through SureContact, so it shows up in the contact's
// activity history.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TEMPLATE_SUBJECT =
  "Your site preview is ready — let's gather your feedback";

const TEMPLATE_HTML = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f6f3ee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2a2622;">
  <div style="max-width:600px;margin:0 auto;padding:40px 28px;background:#ffffff;">
    <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">Hi {{first_name}},</p>

    <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">
      Your site preview for <strong>{{business_name}}</strong> is live and ready for your eyes. Head to your client portal to walk through it before we move into the next phase of the build.
    </p>

    <p style="margin:28px 0;text-align:center;">
      <a href="{{portal_url}}"
         style="display:inline-block;background:#8a6d4e;color:#ffffff;text-decoration:none;
                padding:14px 28px;border-radius:4px;font-size:15px;letter-spacing:0.05em;">
        Open my client portal
      </a>
    </p>

    <p style="font-size:14px;line-height:1.6;margin:0 0 28px;text-align:center;color:#6b6259;">
      Or open the preview directly: <a href="{{preview_url}}" style="color:#8a6d4e;">{{preview_url}}</a>
    </p>

    <p style="font-size:16px;line-height:1.6;margin:0 0 12px;"><strong>How to review your preview:</strong></p>
    <ol style="font-size:15px;line-height:1.7;padding-left:22px;margin:0 0 22px;">
      <li>Click the button above to open your client portal.</li>
      <li>Scroll to the <strong>Site Preview</strong> section &mdash; you'll see every page listed.</li>
      <li>Click <strong>View</strong> next to each page to open it in a new tab and look it over.</li>
      <li>Back in the portal, for each page either:
        <ul style="margin:6px 0 0;padding-left:22px;">
          <li>Click <strong>Comments</strong> under the page to leave specific feedback, or</li>
          <li>Click <strong>Approve</strong> once that page is good to go.</li>
        </ul>
      </li>
      <li>Repeat for every page so we know exactly what's approved and what still needs tweaks.</li>
    </ol>

    <p style="font-size:16px;line-height:1.6;margin:0 0 12px;"><strong>What to look for:</strong></p>
    <ul style="font-size:15px;line-height:1.7;padding-left:22px;margin:0 0 22px;">
      <li>Does the overall feel match your brand?</li>
      <li>Is the messaging clear from the moment someone lands?</li>
      <li>Are there sections you want emphasized, softened, or removed?</li>
      <li>Anything missing that a visitor would expect to see?</li>
    </ul>

    <p style="font-size:16px;line-height:1.6;margin:0 0 18px;">
      Don't worry about being too picky &mdash; the more specific you are now, the faster we land on the final version. Aim to leave your feedback or approvals within the next 3 business days so we can keep your build on schedule.
    </p>

    <p style="font-size:16px;line-height:1.6;margin:0 0 28px;">
      If anything is broken or you can't access the portal, just reply to this email.
    </p>

    <p style="font-size:16px;line-height:1.6;margin:0;">Talking soon,</p>
    <p style="font-size:16px;line-height:1.6;margin:4px 0 0;">Bree<br/>Cre8 Visions</p>
  </div>
</body>
</html>`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
    const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: userData.user.id });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const { error } = await admin
      .from("app_settings")
      .update({
        review_email_subject: TEMPLATE_SUBJECT,
        review_email_html: TEMPLATE_HTML,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (error) return json({ error: error.message }, 500);

    return json({
      success: true,
      action: "saved",
      subject: TEMPLATE_SUBJECT,
      variables: ["first_name", "business_name", "portal_url", "preview_url", "client_name"],
      note: "Template stored locally and sent inline via SureContact /emails/send so it appears in contact activity history.",
    });
  } catch (e) {
    console.error("[create-surecontact-review-template]", e);
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});
