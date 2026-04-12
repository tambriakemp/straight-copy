const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { firstName, lastName, email, brand, service, message } = await req.json();

    // Validate required fields
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

    // Build SureContact request body
    const sureContactBody = {
      primary_fields: {
        email: email.trim(),
        first_name: firstName.trim(),
        last_name: (lastName || "").trim(),
        company: (brand || "").trim(),
        source: "api",
        status: "active",
      },
      custom_fields: {
        service_interest: service || "",
        message: message || "",
      },
      metadata: {
        form_source: "cre8visions_website",
      },
    };

    console.log("Sending contact to SureContact:", email);

    const response = await fetch("https://api.surecontact.com/api/v1/public/contacts", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(sureContactBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("SureContact API error:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ success: false, error: data.message || "Failed to submit contact" }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Contact submitted successfully");
    return new Response(
      JSON.stringify({ success: true, data }),
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
