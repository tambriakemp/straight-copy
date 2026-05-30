// Generates Brain Artifact PDFs for a client project via Anthropic Claude.
// Triggered when the brain_setup journey node transitions to in_progress, or
// invoked manually with { clientProjectId, artifactKey? }.
//
// For each enabled artifact in prompts.ts that does not already have an
// attachment on the "Generate Brain Artifacts" task, we:
//   1. Call Anthropic with the configured prompt + business context.
//   2. Render the response as an editorial PDF (same style as brand voice).
//   3. Upload to the client-assets bucket.
//   4. Insert a project_task_attachments row pointing to the file.
//
// We deliberately do NOT auto-check the acceptance criterion — the criterion
// text says "generated and reviewed" so a human still flips it.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { renderArtifactPdf } from "./pdf.ts";
import { BRAIN_ARTIFACTS, BrainArtifactDef, BrainArtifactContext } from "./prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";
const BUCKET = "client-assets";
const TASK_KEY = "brain_setup.generate_artifacts";

type ArtifactResult = {
  key: string;
  status: "generated" | "skipped" | "failed" | "disabled";
  message?: string;
  pdfPath?: string;
};

async function callClaude(apiKey: string, prompt: string): Promise<string> {
  const resp = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`Claude API ${resp.status}: ${t.slice(0, 500)}`);
  }
  const data = await resp.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("Claude returned empty response");
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const clientProjectId = body.clientProjectId as string | undefined;
    const onlyKey = body.artifactKey as string | undefined;
    const force = body.force === true;

    if (!clientProjectId) {
      return new Response(JSON.stringify({ error: "clientProjectId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    // ---- Load project + client context ----
    const { data: project, error: projErr } = await supabase
      .from("client_projects").select("id, client_id").eq("id", clientProjectId).maybeSingle();
    if (projErr) throw projErr;
    if (!project) throw new Error("Project not found");

    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, business_name, intake_data, brand_kit_intake, brand_voice_doc, brand_voice_quick_ref")
      .eq("id", project.client_id).maybeSingle();
    if (clientErr) throw clientErr;
    if (!client) throw new Error("Client not found");

    if (!client.brand_voice_doc) {
      return new Response(JSON.stringify({
        success: false,
        error: "Brand voice document not yet generated for this client. Generate it first.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- Find target task ----
    const { data: task, error: taskErr } = await supabase
      .from("project_tasks")
      .select("id, acceptance_criteria")
      .eq("client_project_id", clientProjectId)
      .eq("journey_item_key", TASK_KEY)
      .maybeSingle();
    if (taskErr) throw taskErr;
    if (!task) throw new Error(`Task with journey_item_key=${TASK_KEY} not found for this project`);

    // ---- Existing attachments for idempotency ----
    const { data: existingAtts } = await supabase
      .from("project_task_attachments")
      .select("storage_path, file_name")
      .eq("task_id", task.id);
    const existingPrefixes = new Set(
      (existingAtts ?? []).map((a: any) => (a.file_name as string).split("__")[0]),
    );

    const ctx: BrainArtifactContext = {
      businessName: client.business_name || "Untitled Brand",
      intake: (client.intake_data as Record<string, unknown>) ?? {},
      brandKit: (client.brand_kit_intake as Record<string, unknown>) ?? {},
      brandVoiceDoc: client.brand_voice_doc,
      brandVoiceQuickRef: client.brand_voice_quick_ref,
    };

    const targets: BrainArtifactDef[] = BRAIN_ARTIFACTS.filter((a) =>
      onlyKey ? a.key === onlyKey : true
    );

    const results: ArtifactResult[] = [];
    for (const artifact of targets) {
      if (!artifact.enabled) {
        results.push({ key: artifact.key, status: "disabled", message: "Prompt not yet configured" });
        continue;
      }
      if (!force && existingPrefixes.has(artifact.filenamePrefix)) {
        results.push({ key: artifact.key, status: "skipped", message: "Attachment already exists" });
        continue;
      }
      try {
        const prompt = artifact.buildPrompt(ctx);
        const markdown = await callClaude(ANTHROPIC_API_KEY, prompt);

        const generatedAt = new Date();
        const pdfBytes = await renderArtifactPdf(
          markdown, ctx.businessName, artifact.title, artifact.subtitle, generatedAt,
        );
        const ts = generatedAt.toISOString().replace(/[:.]/g, "-");
        const fileName = `${artifact.filenamePrefix}__${ts}.pdf`;
        const storagePath = `clients/${project.client_id}/brain-artifacts/${fileName}`;

        const { error: upErr } = await supabase.storage.from(BUCKET).upload(storagePath, pdfBytes, {
          contentType: "application/pdf", upsert: false,
        });
        if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

        await supabase.from("project_task_attachments").insert({
          task_id: task.id,
          storage_path: storagePath,
          bucket: BUCKET,
          file_name: fileName,
          mime_type: "application/pdf",
          size_bytes: pdfBytes.byteLength,
        });

        // Activity log
        await supabase.from("project_task_activity").insert({
          task_id: task.id,
          kind: "attachment",
          message: `Generated brain artifact: ${artifact.title} ${artifact.subtitle}`.replace(/\.$/, ""),
          metadata: { artifactKey: artifact.key, storagePath },
        });

        results.push({ key: artifact.key, status: "generated", pdfPath: storagePath });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[generate-brain-artifacts] ${artifact.key} failed:`, msg);
        results.push({ key: artifact.key, status: "failed", message: msg });
      }
    }

    return new Response(JSON.stringify({ success: true, clientProjectId, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[generate-brain-artifacts] error:", e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
