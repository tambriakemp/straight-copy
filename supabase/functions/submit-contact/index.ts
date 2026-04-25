import { upsertSureContact } from "../_shared/surecontact.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const serviceLabels: Record<string, string> = {
  campaign: "AI Brand Campaign",
  lifestyle: "Editorial Lifestyle Content",
  video: "Short-Form Video",
  product: "Product Visualization",
  retainer: "Monthly Retainer",
  unsure: "Not Sure Yet",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { firstName, lastName, email, brand, service, message } = await req.json();

    if (!firstName || typeof firstName !== "string" || firstName.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "First name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ success: false, error: "Valid email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("SURECONTACT_API_KEY");
    if (!apiKey) {
      console.error("SURECONTACT_API_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "SureContact API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Sending contact to SureContact:", email);

    const result = await upsertSureContact(
      {
        email,
        firstName,
        lastName,
        company: brand,
        customFields: {
          service_interest: (service && serviceLabels[service]) || service || "",
          message: message || "",
        },
        tags: ["Website Contact Us"],
        lists: ["Cre8 Visions List"],
        metadata: { form_source: "cre8visions_website" },
      },
      apiKey,
    );

    if (!result.ok) {
      console.error("SureContact API error:", JSON.stringify(result.data));
      return new Response(
        JSON.stringify({ success: false, error: result.error || "Failed to submit contact" }),
        { status: result.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Contact submitted successfully");
    return new Response(
      JSON.stringify({ success: true, data: result.data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error submitting contact:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
