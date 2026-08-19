// Read venture metrics out of a platform dashboard screenshot.
//
// Skool and Substack have no API worth using, so the numbers have to be typed
// in by hand every week -- which is exactly the kind of chore that quietly
// stops happening. This turns it into: screenshot, drop, review, save.
//
// It NEVER writes to the database. It returns parsed values for the existing
// entry form to prefill, so every number is still seen by a human before it
// becomes a snapshot. That matters because these feed the portfolio run-rate.
//
// The one parsing rule everything hinges on: Skool renders "not set" as an em
// dash. Reading that as 0 would silently zero out MRR and drag the whole
// portfolio run-rate down. Absent must come back as null, never zero.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import Anthropic from "npm:@anthropic-ai/sdk@0.71.0";
import { partitionParsedMetrics } from "../_shared/metrics-parse.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;   // Anthropic per-image ceiling
const ALLOWED_MEDIA = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const serviceClient = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function authorize(req: Request, sb: ReturnType<typeof serviceClient>): Promise<true | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = auth.slice(7).trim();

  const { data: tok } = await sb.from("api_tokens")
    .select("id, revoked").eq("token_hash", await sha256(token)).maybeSingle();
  if (tok && !tok.revoked) return true;

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) return json({ error: "Unauthorized" }, 401);
  const { data: admin } = await sb.from("admin_users").select("id").eq("user_id", data.user.id).maybeSingle();
  if (!admin) return json({ error: "Forbidden" }, 403);
  return true;
}

/**
 * Every metric we know how to read. `null` is a first-class value here and
 * means "the dashboard showed this field but it had no number" -- distinct
 * from the key being absent, which means "not on screen at all".
 */
const EXTRACT_TOOL: Anthropic.Tool = {
  name: "report_metrics",
  description: "Report every metric visible in the supplied screenshots.",
  input_schema: {
    type: "object",
    properties: {
      paid_members: { type: ["number", "null"], description: "Total paid members/subscribers. Skool labels this 'Member'." },
      free_members: { type: ["number", "null"], description: "Free members/subscribers, if shown separately." },
      mrr_cents: { type: ["number", "null"], description: "Monthly recurring revenue in CENTS. $1,234.50 -> 123450. Null if the dashboard shows a dash or blank." },
      new_mrr_cents: { type: ["number", "null"], description: "New MRR for the period, in cents. Null if shown as a dash." },
      engagement_pct: { type: ["number", "null"], description: "Engagement as a percent number. '8%' -> 8." },
      retention_pct: { type: ["number", "null"], description: "Retention as a percent number. Null if shown as a dash." },
      visitors_30d: { type: ["number", "null"], description: "Visitors in the growth period shown." },
      signups_30d: { type: ["number", "null"], description: "Signups in the growth period shown." },
      conversion_pct: { type: ["number", "null"], description: "Conversion rate as a percent number. '20.0%' -> 20." },
      discovery_rank: { type: ["number", "null"], description: "Discovery/leaderboard rank. '#10544' -> 10544." },
      period_label: { type: ["string", "null"], description: "The growth period the screenshot covers, e.g. 'Last 30 days', verbatim." },
      platform: { type: ["string", "null"], description: "Which platform this looks like: skool, substack, or other." },
      notes: { type: "string", description: "One short line on anything ambiguous, unreadable, or worth a human double-checking. Empty string if nothing." },
    },
    required: ["notes"],
    additionalProperties: false,
  },
};

const SYSTEM = `You read numbers off SaaS dashboard screenshots and report them exactly.

Rules, in order of importance:

1. A dash, em dash, hyphen, "N/A", or blank means THE VALUE IS NOT SET. Report
   null for it. Never report 0 for an absent value -- 0 is a real number that
   means something different, and reporting it would corrupt downstream totals.

2. Only report a metric you can actually SEE in an image. If it is not on
   screen, omit the field entirely rather than guessing or inferring it.

3. Never calculate a metric from other metrics. If MRR is not displayed, do not
   derive it from member count and price. Report null.

4. Money is reported in CENTS as an integer. $1,234.50 becomes 123450.

5. Percentages are reported as the plain number, not a fraction. "8%" is 8.
   "20.0%" is 20.

6. Read digits carefully and re-check any figure over three digits. A misread
   member count is worse than a missing one.

Use the notes field for anything you are unsure of. A human reviews every value
before it is saved, so flagging doubt is useful, not a failure.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const sb = serviceClient();
  const guard = await authorize(req, sb);
  if (guard instanceof Response) return guard;

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY is not configured" }, 500);

  const body = await req.json().catch(() => null) as {
    images?: Array<{ media_type?: string; data?: string }>;
    venture_kind?: string;
  } | null;

  const images = (body?.images ?? []).filter((i) => i?.data && i?.media_type);
  if (!images.length) return json({ error: "No images supplied" }, 400);
  if (images.length > MAX_IMAGES) return json({ error: `At most ${MAX_IMAGES} images per upload` }, 400);

  for (const img of images) {
    if (!ALLOWED_MEDIA.has(img.media_type!)) {
      return json({ error: `Unsupported image type: ${img.media_type}` }, 400);
    }
    // base64 inflates by ~4/3; check the decoded size.
    if ((img.data!.length * 3) / 4 > MAX_IMAGE_BYTES) {
      return json({ error: "One of the images is over 5MB. Try a smaller screenshot." }, 400);
    }
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },   // reading digits, not reasoning hard
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "report_metrics" },
      messages: [{
        role: "user",
        content: [
          ...images.map((img) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: img.media_type as "image/png", data: img.data! },
          })),
          {
            type: "text" as const,
            text: `These are dashboard screenshots${
              body?.venture_kind ? ` for a ${body.venture_kind}` : ""
            }. Report every metric you can see, following the rules exactly.`,
          },
        ],
      }],
    });

    if (response.stop_reason === "refusal") {
      return json({ error: "The model declined to read these images" }, 422);
    }

    const block = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "report_metrics",
    );
    if (!block) return json({ error: "Could not read anything from those images" }, 422);

    const raw = block.input as Record<string, unknown>;
    const { notes, period_label, platform } = raw as {
      notes?: string; period_label?: string; platform?: string;
    };

    // Absent stays absent. See _shared/metrics-parse.ts for why that matters.
    const { metrics, absent } = partitionParsedMetrics(raw);

    return json({
      metrics,
      absent,
      notes: typeof notes === "string" ? notes : "",
      period_label: typeof period_label === "string" ? period_label : null,
      platform: typeof platform === "string" ? platform : null,
      usage: {
        input: response.usage.input_tokens ?? 0,
        output: response.usage.output_tokens ?? 0,
      },
    });
  } catch (e) {
    console.error("parse-metrics-image failed", e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
