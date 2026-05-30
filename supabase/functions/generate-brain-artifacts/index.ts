// Generates Brain Artifact PDFs for a client project via Anthropic Claude.
// Triggered when the brain_setup journey node transitions to in_progress, or
// invoked manually with { clientProjectId, artifactKey? }.
//
// For each enabled artifact in prompts.ts that does not already have an
// attachment on the "Generate Brain Artifacts" task, we:
//   1. Call Anthropic with the configured prompt + business context.
//   2. Render the response as an editorial PDF (or raw markdown for skill files).
//   3. Upload to the client-assets bucket.
//   4. Insert a project_task_attachments row pointing to the file.
//
// PDF artifacts also persist a sibling `<prefix>.md` so skill files generated
// later (which reference prior artifact bodies) can load the raw markdown on
// re-runs even when in-memory accumulation isn't available.
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
  mdPath?: string;
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

    // ---- Find target tasks (artifacts + skills) ----
    const distinctTaskKeys = Array.from(new Set(BRAIN_ARTIFACTS.map((a) => a.taskKey)));
    const { data: taskRows, error: taskErr } = await supabase
      .from("project_tasks")
      .select("id, journey_item_key")
      .eq("client_project_id", clientProjectId)
      .in("journey_item_key", distinctTaskKeys);
    if (taskErr) throw taskErr;
    const tasksByKey = new Map<string, string>(); // journey_item_key -> task.id
    for (const t of (taskRows ?? []) as Array<{ id: string; journey_item_key: string }>) {
      tasksByKey.set(t.journey_item_key, t.id);
    }
    if (tasksByKey.size === 0) {
      throw new Error(`No brain_setup tasks found for project (expected one of: ${distinctTaskKeys.join(", ")})`);
    }

    // ---- Existing attachments for idempotency + loading prior markdown ----
    const allTaskIds = Array.from(tasksByKey.values());
    const { data: existingAtts } = await supabase
      .from("project_task_attachments")
      .select("storage_path, file_name, bucket, mime_type, task_id")
      .in("task_id", allTaskIds);

    // Idempotency tracks (taskId, prefix) so the same prefix on different
    // tasks doesn't cross-skip.
    const completedKeys = new Set<string>(); // `${taskId}::${prefix}`
    type AttRow = { storage_path: string; file_name: string; bucket: string | null; mime_type: string | null; task_id: string };
    const attachmentsByPrefix = new Map<string, AttRow[]>(); // keyed by filename prefix only (for context loading)
    for (const a of (existingAtts ?? []) as AttRow[]) {
      const prefix = a.file_name.split("__")[0];
      completedKeys.add(`${a.task_id}::${prefix}`);
      const arr = attachmentsByPrefix.get(prefix) ?? [];
      arr.push(a);
      attachmentsByPrefix.set(prefix, arr);
    }

    // Build previousArtifacts map from any stored .md (or text/markdown) attachments
    // so chained skill prompts can reference earlier artifact bodies on re-runs.
    const previousArtifacts: Record<string, string> = {};
    for (const artifact of BRAIN_ARTIFACTS) {
      const candidates = attachmentsByPrefix.get(artifact.filenamePrefix) ?? [];
      const md = candidates.find((a) =>
        a.file_name.toLowerCase().endsWith(".md") || a.mime_type === "text/markdown"
      );
      if (!md) continue;
      try {
        const bucket = md.bucket || BUCKET;
        const dl = await supabase.storage.from(bucket).download(md.storage_path);
        if (dl.data) {
          previousArtifacts[artifact.key] = await dl.data.text();
        }
      } catch (_e) {
        // best-effort
      }
    }

    const baseCtx: Omit<BrainArtifactContext, "previousArtifacts"> = {
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
      if (!force && completedKeys.has(artifact.filenamePrefix)) {
        results.push({ key: artifact.key, status: "skipped", message: "Attachment already exists" });
        continue;
      }
      try {
        const ctx: BrainArtifactContext = { ...baseCtx, previousArtifacts };
        const prompt = artifact.buildPrompt(ctx);
        const markdown = await callClaude(ANTHROPIC_API_KEY, prompt);

        // Accumulate so subsequent prompts in this same run can reference it.
        previousArtifacts[artifact.key] = markdown;

        const generatedAt = new Date();
        const ts = generatedAt.toISOString().replace(/[:.]/g, "-");
        const result: ArtifactResult = { key: artifact.key, status: "generated" };

        if (artifact.format === "pdf") {
          // Render & upload the editorial PDF.
          const pdfBytes = await renderArtifactPdf(
            markdown, ctx.businessName, artifact.title, artifact.subtitle, generatedAt,
          );
          const pdfName = `${artifact.filenamePrefix}__${ts}.pdf`;
          const pdfPath = `clients/${project.client_id}/brain-artifacts/${pdfName}`;
          const upPdf = await supabase.storage.from(BUCKET).upload(pdfPath, pdfBytes, {
            contentType: "application/pdf", upsert: false,
          });
          if (upPdf.error) throw new Error(`PDF upload failed: ${upPdf.error.message}`);
          await supabase.from("project_task_attachments").insert({
            task_id: task.id, storage_path: pdfPath, bucket: BUCKET,
            file_name: pdfName, mime_type: "application/pdf", size_bytes: pdfBytes.byteLength,
          });
          result.pdfPath = pdfPath;

          // Also persist the raw markdown as a sibling attachment so future
          // skill-file runs can load it from storage.
          const mdName = `${artifact.filenamePrefix}__${ts}.md`;
          const mdPath = `clients/${project.client_id}/brain-artifacts/${mdName}`;
          const mdBytes = new TextEncoder().encode(markdown);
          const upMd = await supabase.storage.from(BUCKET).upload(mdPath, mdBytes, {
            contentType: "text/markdown", upsert: false,
          });
          if (!upMd.error) {
            await supabase.from("project_task_attachments").insert({
              task_id: task.id, storage_path: mdPath, bucket: BUCKET,
              file_name: mdName, mime_type: "text/markdown", size_bytes: mdBytes.byteLength,
            });
            result.mdPath = mdPath;
          }
        } else {
          // Markdown-only artifact (skill files). Upload as .md.
          const mdName = `${artifact.filenamePrefix}__${ts}.md`;
          const mdPath = `clients/${project.client_id}/brain-artifacts/${mdName}`;
          const mdBytes = new TextEncoder().encode(markdown);
          const upMd = await supabase.storage.from(BUCKET).upload(mdPath, mdBytes, {
            contentType: "text/markdown", upsert: false,
          });
          if (upMd.error) throw new Error(`Markdown upload failed: ${upMd.error.message}`);
          await supabase.from("project_task_attachments").insert({
            task_id: task.id, storage_path: mdPath, bucket: BUCKET,
            file_name: mdName, mime_type: "text/markdown", size_bytes: mdBytes.byteLength,
          });
          result.mdPath = mdPath;
        }

        // Activity log
        await supabase.from("project_task_activity").insert({
          task_id: task.id,
          kind: "attachment",
          message: `Generated brain artifact: ${artifact.title} ${artifact.subtitle}`.replace(/\.$/, ""),
          metadata: { artifactKey: artifact.key, format: artifact.format, pdfPath: result.pdfPath, mdPath: result.mdPath },
        });

        results.push(result);
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
