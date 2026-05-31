// Orchestrator for Stage 5 — Automation 01.
//
// Fired by `fire_automation_01_build` when the automation_01 journey node enters
// in_progress. Also callable directly with { clientProjectId, only?: string[], force?: boolean }.
//
// Pipeline (idempotent per task):
//   1. lead_magnet_generated       — Claude → branded one-page PDF → attach
//   2. surecontact_api_key_added   — GATE. Skip everything below until set.
//   3. surecontact_list_created    — REST upsert seeds list + 6 tags via stub contact
//   4. nurture_emails_written      — Claude writes 5 branded HTML emails → attach
//   5. nurture_sequence_built      — Best-effort REST create; fallback = 5 scheduled campaigns
//   6. landing_page_assets_generated — Claude landing copy + brand snippet → attach as .md
//   7. landing_page_built          — Probe MCP tools/list:
//                                      • If a landing-page-create tool exists → call it,
//                                        write URL onto task.url, mark complete.
//                                      • Otherwise → leave for agency, append note.
//   8. flow_tested                 — agency-only, never auto-completed.
//   9. landing_page_sent_to_client — Auto when task #7 URL is present.
//
// Each step writes a project_task_activity row and (when appropriate) flips its
// task to `complete`, which propagates back to the journey_node checklist via
// the existing sync trigger.

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import {
  BrandCtx,
  LANDING_PAGE_COPY_PROMPT,
  LEAD_MAGNET_PROMPT,
  NURTURE_EMAILS,
  NURTURE_EMAIL_PROMPT,
  NurtureEmailSpec,
} from "./prompts.ts";
import { upsertSureContact } from "../_shared/surecontact.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";
const BUCKET = "client-assets";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ENC_KEY = Deno.env.get("PROJECT_SECRETS_KEY") ?? "";

// Task keys
const K = {
  lead:    "automation_01.lead_magnet_generated",
  apiKey:  "automation_01.surecontact_api_key_added",
  list:    "automation_01.surecontact_list_created",
  emails:  "automation_01.nurture_emails_written",
  seq:     "automation_01.nurture_sequence_built",
  lpCopy:  "automation_01.landing_page_assets_generated",
  lpBuilt: "automation_01.landing_page_built",
  tested:  "automation_01.flow_tested",
  sent:    "automation_01.landing_page_sent_to_client",
};

const TAGS = ["new-lead", "lead-magnet-delivered", "qualified", "not-a-fit", "converted", "nurture"];

type StepResult = { key: string; status: "complete" | "skipped" | "failed" | "manual"; message?: string };

// ---------- helpers ----------
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callClaude(prompt: string, maxTokens = 4000): Promise<string> {
  const r = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const data = await r.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("Claude returned empty");
  return text;
}

function parseJsonFromClaude<T>(raw: string): T {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(trimmed) as T;
}

async function getTasksByKey(sb: SupabaseClient, clientProjectId: string): Promise<Map<string, { id: string; status: string; url: string | null }>> {
  const { data, error } = await sb.from("project_tasks")
    .select("id, journey_item_key, status, url")
    .eq("client_project_id", clientProjectId)
    .like("journey_item_key", "automation_01.%");
  if (error) throw error;
  const m = new Map();
  for (const t of data ?? []) m.set(t.journey_item_key, { id: t.id, status: t.status, url: t.url });
  return m;
}

async function markTaskComplete(sb: SupabaseClient, taskId: string, opts: { url?: string } = {}) {
  const patch: Record<string, unknown> = { status: "complete", completed_at: new Date().toISOString() };
  if (opts.url) patch.url = opts.url;
  await sb.from("project_tasks").update(patch).eq("id", taskId);
}

async function logActivity(sb: SupabaseClient, taskId: string, kind: string, message: string, metadata: Record<string, unknown> = {}) {
  await sb.from("project_task_activity").insert({ task_id: taskId, kind, message, metadata });
}

async function hasAttachment(sb: SupabaseClient, taskId: string, namePrefix: string): Promise<boolean> {
  const { data } = await sb.from("project_task_attachments").select("id, file_name").eq("task_id", taskId);
  return (data ?? []).some((a: { file_name: string }) => a.file_name.startsWith(namePrefix));
}

async function uploadAttachment(
  sb: SupabaseClient,
  opts: { taskId: string; clientId: string; fileName: string; mime: string; bytes: Uint8Array },
) {
  const path = `clients/${opts.clientId}/automation-01/${opts.fileName}`;
  const up = await sb.storage.from(BUCKET).upload(path, opts.bytes, { contentType: opts.mime, upsert: true });
  if (up.error) throw new Error(`upload failed: ${up.error.message}`);
  await sb.from("project_task_attachments").insert({
    task_id: opts.taskId, storage_path: path, bucket: BUCKET,
    file_name: opts.fileName, mime_type: opts.mime, size_bytes: opts.bytes.byteLength,
  });
  return path;
}

async function publicUrl(sb: SupabaseClient, path: string): Promise<string> {
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function getProjectSecret(sb: SupabaseClient, clientProjectId: string, key: string): Promise<string | null> {
  if (!ENC_KEY) return null;
  const { data, error } = await sb.rpc("get_project_secret", {
    _client_project_id: clientProjectId, _key: key, _enc_key: ENC_KEY,
  });
  if (error) return null;
  return (data ?? null) as string | null;
}

// ---------- Step 1: lead magnet PDF ----------
type LeadMagnetJson = { title: string; subtitle: string; intro: string; sections: { heading: string; body: string }[]; cta: string };

async function renderLeadMagnetPdf(c: BrandCtx, lm: LeadMagnetJson): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);

  // hex -> rgb 0..1
  const hex = (h: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
    if (!m) return rgb(0.1, 0.1, 0.1);
    const n = parseInt(m[1], 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  };
  const primary = hex(c.primaryColor);
  const accent = hex(c.accentColor);
  const ink = rgb(0.1, 0.1, 0.1);
  const muted = rgb(0.4, 0.4, 0.4);

  // Hero band
  page.drawRectangle({ x: 0, y: 692, width: 612, height: 100, color: primary });
  page.drawText(c.businessName, { x: 48, y: 752, size: 11, font: bold, color: rgb(1, 1, 1) });
  const title = lm.title.slice(0, 60);
  page.drawText(title, { x: 48, y: 720, size: 22, font: serif, color: rgb(1, 1, 1) });

  let y = 660;
  const margin = 48;
  const maxW = 612 - margin * 2;

  function wrap(text: string, font = body, size = 11): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > maxW) {
        if (cur) lines.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function draw(text: string, opts: { size?: number; font?: typeof body; color?: ReturnType<typeof rgb>; gap?: number } = {}) {
    const size = opts.size ?? 11;
    const f = opts.font ?? body;
    const color = opts.color ?? ink;
    for (const line of wrap(text, f, size)) {
      if (y < 80) return;
      page.drawText(line, { x: margin, y, size, font: f, color });
      y -= size + 4;
    }
    y -= opts.gap ?? 6;
  }

  draw(lm.subtitle, { size: 12, font: serif, color: muted, gap: 14 });
  draw(lm.intro, { gap: 12 });

  for (const s of lm.sections) {
    if (y < 140) break;
    page.drawRectangle({ x: margin, y: y - 2, width: 24, height: 2, color: accent });
    y -= 14;
    draw(s.heading, { size: 13, font: bold, gap: 6 });
    // checklist: lines starting with "- "
    const isList = /^- /m.test(s.body);
    if (isList) {
      for (const line of s.body.split(/\n+/)) {
        const t = line.replace(/^- /, "").trim();
        if (!t) continue;
        draw(`• ${t}`, { gap: 2 });
      }
      y -= 8;
    } else {
      draw(s.body, { gap: 10 });
    }
  }

  // CTA band
  if (y > 100) {
    page.drawRectangle({ x: margin, y: y - 36, width: maxW, height: 36, color: accent });
    page.drawText(lm.cta.slice(0, 90), { x: margin + 12, y: y - 22, size: 11, font: bold, color: rgb(1, 1, 1) });
  }

  return await doc.save();
}

async function stepLeadMagnet(sb: SupabaseClient, clientProjectId: string, clientId: string, taskId: string, c: BrandCtx, force: boolean): Promise<StepResult> {
  if (!force && await hasAttachment(sb, taskId, "lead-magnet")) {
    return { key: K.lead, status: "skipped", message: "Already attached" };
  }
  const raw = await callClaude(LEAD_MAGNET_PROMPT(c));
  const lm = parseJsonFromClaude<LeadMagnetJson>(raw);
  const pdf = await renderLeadMagnetPdf(c, lm);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `lead-magnet__${ts}.pdf`;
  const path = await uploadAttachment(sb, { taskId, clientId, fileName, mime: "application/pdf", bytes: pdf });
  const url = await publicUrl(sb, path);
  c.leadMagnetUrl = url;
  c.leadMagnetTitle = lm.title;
  await logActivity(sb, taskId, "attachment", `Lead magnet generated: ${lm.title}`, { url, path });
  await markTaskComplete(sb, taskId, { url });
  return { key: K.lead, status: "complete" };
}

// ---------- Step 3: SureContact list + tags ----------
async function stepCreateList(sb: SupabaseClient, taskId: string, c: BrandCtx, apiKey: string, force: boolean, task: { status: string }): Promise<StepResult> {
  if (!force && task.status === "complete") return { key: K.list, status: "skipped" };
  const listName = `${c.businessName} Leads`;
  const stubEmail = `setup+${Date.now()}@cre8visions.com`;
  const seed = await upsertSureContact({
    email: stubEmail,
    firstName: "Setup",
    lastName: "Stub",
    company: c.businessName,
    tags: TAGS,
    lists: [listName],
    metadata: { source: "automation_01_setup_stub" },
  }, apiKey);
  if (!seed.ok) return { key: K.list, status: "failed", message: `Seed upsert failed: ${seed.error}` };

  // Remove stub from list + tags (best-effort; ignore failure).
  const cleanup = await upsertSureContact({
    email: stubEmail,
    tagsToRemove: TAGS,
    lists: [],
    metadata: { source: "automation_01_setup_cleanup" },
  }, apiKey);

  await logActivity(sb, taskId, "automation", `Created list "${listName}" with 6 tags in SureContact`, {
    listName, tags: TAGS, cleanupOk: cleanup.ok,
  });
  await markTaskComplete(sb, taskId);
  return { key: K.list, status: "complete" };
}

// ---------- Step 4: nurture email HTML ----------
type EmailJson = { subject: string; preheader: string; html: string };

async function stepNurtureEmails(sb: SupabaseClient, clientId: string, taskId: string, c: BrandCtx, force: boolean): Promise<{ result: StepResult; emails: (EmailJson & { spec: NurtureEmailSpec })[] }> {
  const existing = !force && await hasAttachment(sb, taskId, "email_");
  if (existing) {
    // Load existing emails for downstream use.
    const { data } = await sb.from("project_task_attachments").select("file_name, storage_path").eq("task_id", taskId);
    const out: (EmailJson & { spec: NurtureEmailSpec })[] = [];
    for (const spec of NURTURE_EMAILS) {
      const a = (data ?? []).find((x: { file_name: string }) => x.file_name.startsWith(spec.key));
      if (!a) continue;
      try {
        const dl = await sb.storage.from(BUCKET).download(a.storage_path);
        const text = await dl.data?.text();
        if (text) out.push({ ...JSON.parse(text), spec });
      } catch { /* skip */ }
    }
    return { result: { key: K.emails, status: "skipped" }, emails: out };
  }

  const written: (EmailJson & { spec: NurtureEmailSpec })[] = [];
  for (const spec of NURTURE_EMAILS) {
    const raw = await callClaude(NURTURE_EMAIL_PROMPT(c, spec), 3000);
    const e = parseJsonFromClaude<EmailJson>(raw);
    // Substitute {{lead_magnet_url}} / {{lead_magnet_title}} in subject + html.
    const subst = (s: string) => s
      .replaceAll("{{lead_magnet_url}}", c.leadMagnetUrl ?? "#")
      .replaceAll("{{lead_magnet_title}}", c.leadMagnetTitle ?? "your guide");
    const final: EmailJson = { subject: subst(e.subject), preheader: subst(e.preheader), html: subst(e.html) };
    written.push({ ...final, spec });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `${spec.key}__${ts}.json`;
    await uploadAttachment(sb, {
      taskId, clientId, fileName, mime: "application/json",
      bytes: new TextEncoder().encode(JSON.stringify(final, null, 2)),
    });
  }
  await logActivity(sb, taskId, "automation", `Wrote ${written.length} branded nurture emails`, {
    emails: written.map((w) => ({ key: w.spec.key, subject: w.subject })),
  });
  await markTaskComplete(sb, taskId);
  return { result: { key: K.emails, status: "complete" }, emails: written };
}

// ---------- Step 5: sequence built (best-effort REST) ----------
async function stepBuildSequence(
  sb: SupabaseClient, taskId: string, c: BrandCtx, apiKey: string,
  emails: (EmailJson & { spec: NurtureEmailSpec })[], force: boolean, task: { status: string },
): Promise<StepResult> {
  if (!force && task.status === "complete") return { key: K.seq, status: "skipped" };
  if (emails.length === 0) return { key: K.seq, status: "failed", message: "No emails available" };

  // Try the documented "create automation" endpoint. If it 404s / 401s we fall
  // back to scheduling individual campaigns.
  const tryAutomation = await fetch("https://api.surecontact.com/api/v1/public/automations", {
    method: "POST",
    headers: { "X-API-Key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      name: `${c.businessName} — Lead Magnet Nurture`,
      trigger: { type: "tag_added", tag: "new-lead" },
      steps: emails.map((e) => ({
        type: "send_email",
        delay_days: e.spec.delayDays,
        email: { subject: e.subject, preheader: e.preheader, html: e.html, from_name: c.businessName },
      })),
    }),
  }).catch((e) => ({ ok: false, status: 0, _err: e instanceof Error ? e.message : String(e) } as any));

  if ((tryAutomation as Response).ok) {
    const data = await (tryAutomation as Response).json().catch(() => null);
    await logActivity(sb, taskId, "automation", "Created SureContact automation triggered by new-lead tag", { mode: "automation", data });
    await markTaskComplete(sb, taskId);
    return { key: K.seq, status: "complete" };
  }

  // Fallback: schedule 5 individual campaigns.
  const created: unknown[] = [];
  for (const e of emails) {
    const sendAt = new Date(Date.now() + e.spec.delayDays * 24 * 60 * 60 * 1000).toISOString();
    const r = await fetch("https://api.surecontact.com/api/v1/public/campaigns", {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name: `${c.businessName} — ${e.spec.key}`,
        subject: e.subject,
        preheader: e.preheader,
        body_html: e.html,
        from_name: c.businessName,
        scheduled_at: sendAt,
        tag_filter: "new-lead",
        list_filter: `${c.businessName} Leads`,
      }),
    });
    const d = await r.json().catch(() => null);
    created.push({ key: e.spec.key, status: r.status, ok: r.ok, data: d });
  }
  const okCount = (created as { ok: boolean }[]).filter((x) => x.ok).length;
  await logActivity(sb, taskId, "automation",
    okCount === emails.length
      ? `Scheduled ${okCount} campaigns (automation endpoint unavailable, fell back to campaigns)`
      : `Partial sequence: ${okCount}/${emails.length} campaigns created`,
    { mode: "campaigns_fallback", created });
  if (okCount === emails.length) {
    await markTaskComplete(sb, taskId);
    return { key: K.seq, status: "complete" };
  }
  return { key: K.seq, status: "failed", message: `Only ${okCount}/${emails.length} campaigns scheduled` };
}

// ---------- Step 6: landing page assets ----------
type LandingCopyJson = { headline: string; subhead: string; bullets: string[]; form_label: string; cta_button: string; trust_line: string; footer_line: string };

async function stepLandingAssets(sb: SupabaseClient, clientId: string, taskId: string, c: BrandCtx, force: boolean): Promise<{ result: StepResult; copy: LandingCopyJson | null }> {
  if (!force && await hasAttachment(sb, taskId, "landing-page-copy")) {
    return { result: { key: K.lpCopy, status: "skipped" }, copy: null };
  }
  const raw = await callClaude(LANDING_PAGE_COPY_PROMPT(c), 2500);
  const copy = parseJsonFromClaude<LandingCopyJson>(raw);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  const md = `# Landing Page Copy — ${c.businessName}

## Headline
${copy.headline}

## Subhead
${copy.subhead}

## Bullets
${copy.bullets.map((b) => `- ${b}`).join("\n")}

## Form
- Label: ${copy.form_label}
- Button: ${copy.cta_button}
- Trust line: ${copy.trust_line}

## Footer
${copy.footer_line}

---

# Brand Snippet
- Primary color: ${c.primaryColor}
- Accent color: ${c.accentColor}
- Heading font: ${c.headingFont}
- Body font: ${c.bodyFont}
- Logo: ${c.logoUrl ?? "(none)"}
- Lead magnet: ${c.leadMagnetTitle}
${c.leadMagnetUrl ? `- Lead magnet URL: ${c.leadMagnetUrl}` : ""}

## Form behavior
- On submit, post to SureContact upsert with the email, tag with \`new-lead\`, and add to list \`${c.businessName} Leads\`.
- After submit, redirect to a thank-you page that shows the lead magnet download.
`;
  await uploadAttachment(sb, {
    taskId, clientId, fileName: `landing-page-copy__${ts}.md`, mime: "text/markdown",
    bytes: new TextEncoder().encode(md),
  });
  await logActivity(sb, taskId, "attachment", "Generated landing page copy + brand snippet", { headline: copy.headline });
  await markTaskComplete(sb, taskId);
  return { result: { key: K.lpCopy, status: "complete" }, copy };
}

// ---------- Step 7: landing page built (MCP probe + best-effort build) ----------
async function probeMcp(mcpUrl: string, apiKey: string): Promise<{ tools: { name: string; description?: string }[]; sessionId?: string | null } | null> {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "X-API-Key": apiKey,
  };
  // initialize
  const init = await fetch(mcpUrl, {
    method: "POST", headers,
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "cre8visions-orchestrator", version: "1.0.0" } },
    }),
  }).catch(() => null);
  if (!init || !init.ok) return null;
  const sessionId = init.headers.get("mcp-session-id");
  // tools/list
  const listHeaders: Record<string, string> = { ...headers };
  if (sessionId) listHeaders["Mcp-Session-Id"] = sessionId;
  const tl = await fetch(mcpUrl, {
    method: "POST", headers: listHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  }).catch(() => null);
  if (!tl || !tl.ok) return null;

  // Parse JSON or SSE
  const ct = tl.headers.get("content-type") ?? "";
  let payload: any = null;
  if (ct.includes("text/event-stream")) {
    const text = await tl.text();
    const dataLine = text.split(/\n/).find((l) => l.startsWith("data:"));
    if (dataLine) payload = JSON.parse(dataLine.slice(5).trim());
  } else {
    payload = await tl.json().catch(() => null);
  }
  const tools = payload?.result?.tools;
  if (!Array.isArray(tools)) return null;
  return { tools, sessionId };
}

function findLandingPageTool(tools: { name: string; description?: string }[]): { name: string } | null {
  // Heuristic match. Adjust here when SureContact publishes a canonical name.
  const score = (t: { name: string; description?: string }) => {
    const s = `${t.name} ${t.description ?? ""}`.toLowerCase();
    let v = 0;
    if (/landing[\s_-]?page/.test(s)) v += 3;
    if (/create|build|new|generate|publish/.test(s)) v += 2;
    return v;
  };
  const ranked = [...tools].map((t) => ({ t, v: score(t) })).filter((x) => x.v >= 3).sort((a, b) => b.v - a.v);
  return ranked[0]?.t ?? null;
}

async function callMcpTool(mcpUrl: string, apiKey: string, sessionId: string | null | undefined, name: string, args: Record<string, unknown>): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "X-API-Key": apiKey,
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;
  const r = await fetch(mcpUrl, {
    method: "POST", headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name, arguments: args } }),
  });
  if (!r.ok) throw new Error(`MCP tools/call ${name} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const ct = r.headers.get("content-type") ?? "";
  if (ct.includes("text/event-stream")) {
    const text = await r.text();
    const dataLine = text.split(/\n/).find((l) => l.startsWith("data:"));
    return dataLine ? JSON.parse(dataLine.slice(5).trim()) : null;
  }
  return await r.json();
}

function extractUrlFromMcpResult(payload: any): string | null {
  // Try common shapes
  const r = payload?.result;
  if (!r) return null;
  // structured content array
  const content = r.content;
  const blob = JSON.stringify(r);
  const m = /https?:\/\/[^\s"'<>)]+/.exec(blob);
  return m ? m[0] : null;
}

async function stepLandingPageBuilt(
  sb: SupabaseClient, clientProjectId: string, taskId: string, c: BrandCtx, copy: LandingCopyJson | null, task: { status: string; url: string | null },
): Promise<StepResult> {
  // If agency already pasted a URL or marked complete, nothing to do.
  if (task.status === "complete" || (task.url && /^https?:\/\//i.test(task.url))) {
    return { key: K.lpBuilt, status: "skipped", message: "Already has URL or complete" };
  }
  const apiKey = await getProjectSecret(sb, clientProjectId, "surecontact_api_key");
  const mcpUrl = await getProjectSecret(sb, clientProjectId, "surecontact_mcp_url");
  if (!apiKey || !mcpUrl) {
    await logActivity(sb, taskId, "note", "Agency-manual: SureContact API key or MCP URL missing — cannot probe MCP. Build landing page in SureContact UI using attached copy.");
    return { key: K.lpBuilt, status: "manual", message: "Credentials missing — agency-manual" };
  }
  const probe = await probeMcp(mcpUrl, apiKey);
  if (!probe) {
    await logActivity(sb, taskId, "note", "Agency-manual: MCP probe failed. Build landing page in SureContact UI using attached copy.");
    return { key: K.lpBuilt, status: "manual", message: "MCP unreachable — agency-manual" };
  }
  const lpTool = findLandingPageTool(probe.tools);
  if (!lpTool) {
    await logActivity(sb, taskId, "note",
      `Agency-manual: MCP reachable but no landing-page tool exposed (tools available: ${probe.tools.map((t) => t.name).join(", ") || "none"}). Build landing page in SureContact UI using attached copy.`,
      { tools: probe.tools.map((t) => t.name) });
    return { key: K.lpBuilt, status: "manual", message: "No landing-page MCP tool available" };
  }

  // Best-effort call. We can't know the exact arg shape, so pass a rich payload
  // covering common naming conventions.
  if (!copy) {
    await logActivity(sb, taskId, "note", "Agency-manual: landing-page MCP tool found but copy assets not yet generated.");
    return { key: K.lpBuilt, status: "manual", message: "Copy not yet generated" };
  }
  const args = {
    name: `${c.businessName} — Lead Magnet`,
    title: copy.headline,
    headline: copy.headline,
    subhead: copy.subhead,
    bullets: copy.bullets,
    form_label: copy.form_label,
    cta_button: copy.cta_button,
    trust_line: copy.trust_line,
    footer: copy.footer_line,
    brand: {
      primary_color: c.primaryColor,
      accent_color: c.accentColor,
      heading_font: c.headingFont,
      body_font: c.bodyFont,
      logo_url: c.logoUrl,
    },
    form: {
      list: `${c.businessName} Leads`,
      tags: ["new-lead"],
    },
    redirect_url: c.leadMagnetUrl ?? null,
    lead_magnet_url: c.leadMagnetUrl ?? null,
    publish: true,
  };
  try {
    const result = await callMcpTool(mcpUrl, apiKey, probe.sessionId, lpTool.name, args);
    const url = extractUrlFromMcpResult(result);
    if (url) {
      await logActivity(sb, taskId, "automation", `Landing page built via MCP tool "${lpTool.name}"`, { tool: lpTool.name, url, result });
      await markTaskComplete(sb, taskId, { url });
      return { key: K.lpBuilt, status: "complete", message: url };
    }
    await logActivity(sb, taskId, "note", `MCP tool "${lpTool.name}" returned no URL — agency-manual review required`, { tool: lpTool.name, result });
    return { key: K.lpBuilt, status: "manual", message: "MCP returned no URL" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logActivity(sb, taskId, "error", `MCP landing-page call failed: ${msg}`);
    return { key: K.lpBuilt, status: "manual", message: msg };
  }
}

// ---------- Step 9: send landing page URL to client ----------
async function stepSendToClient(sb: SupabaseClient, clientId: string, clientEmail: string | null, contactName: string | null, lpUrl: string, taskId: string, force: boolean, task: { status: string }): Promise<StepResult> {
  if (!force && task.status === "complete") return { key: K.sent, status: "skipped" };
  if (!clientEmail) return { key: K.sent, status: "failed", message: "No client email on record" };
  const { error } = await sb.functions.invoke("send-transactional-email", {
    body: {
      template: "generic-notification",
      to: clientEmail,
      subject: "Your lead-magnet landing page is live",
      data: {
        recipientName: contactName ?? "there",
        title: "Your landing page is live",
        body: `Your new lead-magnet landing page is ready:\n\n${lpUrl}\n\nWe've also set up the nurture sequence in your SureContact account — every new lead will receive the welcome email and the rest of the sequence over the following days.`,
      },
    },
  });
  if (error) return { key: K.sent, status: "failed", message: error.message };
  await logActivity(sb, taskId, "email", `Sent landing-page URL to client (${clientEmail})`, { url: lpUrl });
  await markTaskComplete(sb, taskId);
  return { key: K.sent, status: "complete" };
}

// ---------- main ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    if (!ANTHROPIC_API_KEY) return json({ success: false, error: "ANTHROPIC_API_KEY not configured" }, 500);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const clientProjectId = (body.clientProjectId ?? body.client_project_id) as string | undefined;
    const force = body.force === true;
    const onlySet: Set<string> | null = Array.isArray(body.only) ? new Set((body.only as string[]).map((x) => `automation_01.${x.replace(/^automation_01\./, "")}`)) : null;
    if (!clientProjectId) return json({ error: "clientProjectId required" }, 400);

    // Load project + client + tasks
    const { data: project, error: pErr } = await sb.from("client_projects").select("id, client_id").eq("id", clientProjectId).maybeSingle();
    if (pErr || !project) return json({ error: "project not found" }, 404);
    const { data: client, error: cErr } = await sb.from("clients")
      .select("id, business_name, contact_name, contact_email, intake_data, brand_kit_intake, brand_voice_doc, brand_voice_quick_ref")
      .eq("id", project.client_id).maybeSingle();
    if (cErr || !client) return json({ error: "client not found" }, 404);
    if (!client.brand_voice_doc) return json({ success: false, error: "Brand voice doc not generated yet" }, 400);

    const tasks = await getTasksByKey(sb, clientProjectId);
    const need = (k: string) => {
      const t = tasks.get(k);
      if (!t) throw new Error(`Task ${k} missing — has the journey node been seeded?`);
      return t;
    };

    // Build brand context
    const bk = (client.brand_kit_intake ?? {}) as Record<string, any>;
    const intake = (client.intake_data ?? {}) as Record<string, any>;
    const c: BrandCtx = {
      businessName: client.business_name || "Untitled Brand",
      oneLiner: (intake.one_liner ?? intake.oneLiner ?? bk.one_liner ?? "") as string,
      audience: (intake.target_audience ?? intake.audience ?? "") as string,
      primaryColor: (bk.primary_color ?? bk.primaryColor ?? "#1a1a1a") as string,
      accentColor: (bk.accent_color ?? bk.accentColor ?? bk.secondary_color ?? "#a47148") as string,
      headingFont: (bk.heading_font ?? bk.headingFont ?? "Georgia") as string,
      bodyFont: (bk.body_font ?? bk.bodyFont ?? "Helvetica") as string,
      logoUrl: (bk.logo_url ?? bk.logoUrl ?? null) as string | null,
      brandVoiceDoc: client.brand_voice_doc,
      brandVoiceQuickRef: client.brand_voice_quick_ref ?? null,
      intake, brandKit: bk,
      leadMagnetTitle: (intake.lead_magnet_title ?? `The ${client.business_name} Quick-Start Guide`) as string,
    };

    const wants = (k: string) => !onlySet || onlySet.has(k);
    const results: StepResult[] = [];

    // 1. Lead magnet
    if (wants(K.lead)) {
      try {
        const r = await stepLeadMagnet(sb, clientProjectId, client.id, need(K.lead).id, c, force);
        results.push(r);
        // re-read URL onto context if step skipped (already had attachment)
        if (!c.leadMagnetUrl) {
          const { data: atts } = await sb.from("project_task_attachments").select("storage_path, file_name").eq("task_id", need(K.lead).id);
          const pdf = (atts ?? []).find((a: { file_name: string }) => a.file_name.startsWith("lead-magnet"));
          if (pdf) c.leadMagnetUrl = await publicUrl(sb, pdf.storage_path);
        }
      } catch (e) { results.push({ key: K.lead, status: "failed", message: e instanceof Error ? e.message : String(e) }); }
    }

    // 2. Gate: SureContact API key
    const apiKey = await getProjectSecret(sb, clientProjectId, "surecontact_api_key");
    if (!apiKey) {
      results.push({ key: K.apiKey, status: "manual", message: "Agency: add SureContact API key + MCP URL in Settings tab" });
      return json({ success: true, clientProjectId, results, note: "Gated — add SureContact API key to continue" });
    }

    // 3. List + tags
    if (wants(K.list)) {
      try { results.push(await stepCreateList(sb, need(K.list).id, c, apiKey, force, need(K.list))); }
      catch (e) { results.push({ key: K.list, status: "failed", message: e instanceof Error ? e.message : String(e) }); }
    }

    // 4. Nurture emails
    let emails: (EmailJson & { spec: NurtureEmailSpec })[] = [];
    if (wants(K.emails)) {
      try {
        const r = await stepNurtureEmails(sb, client.id, need(K.emails).id, c, force);
        results.push(r.result);
        emails = r.emails;
      } catch (e) { results.push({ key: K.emails, status: "failed", message: e instanceof Error ? e.message : String(e) }); }
    }

    // 5. Sequence
    if (wants(K.seq)) {
      try { results.push(await stepBuildSequence(sb, need(K.seq).id, c, apiKey, emails, force, need(K.seq))); }
      catch (e) { results.push({ key: K.seq, status: "failed", message: e instanceof Error ? e.message : String(e) }); }
    }

    // 6. Landing page copy
    let copy: LandingCopyJson | null = null;
    if (wants(K.lpCopy)) {
      try {
        const r = await stepLandingAssets(sb, client.id, need(K.lpCopy).id, c, force);
        results.push(r.result);
        copy = r.copy;
      } catch (e) { results.push({ key: K.lpCopy, status: "failed", message: e instanceof Error ? e.message : String(e) }); }
    }

    // 7. Landing page built (MCP)
    if (wants(K.lpBuilt)) {
      try {
        const t = need(K.lpBuilt);
        results.push(await stepLandingPageBuilt(sb, clientProjectId, t.id, c, copy, t));
      } catch (e) { results.push({ key: K.lpBuilt, status: "failed", message: e instanceof Error ? e.message : String(e) }); }
    }

    // 8. flow_tested — agency-only, skip

    // 9. Send to client (only if landing page URL is now present)
    if (wants(K.sent)) {
      // Re-read landing-page task to see if URL is present (set by MCP step or by agency)
      const { data: lpRow } = await sb.from("project_tasks").select("url, status").eq("id", need(K.lpBuilt).id).maybeSingle();
      const lpUrl = lpRow?.url && /^https?:\/\//i.test(lpRow.url) ? lpRow.url : null;
      if (lpUrl) {
        try {
          results.push(await stepSendToClient(sb, client.id, client.contact_email, client.contact_name, lpUrl, need(K.sent).id, force, need(K.sent)));
        } catch (e) { results.push({ key: K.sent, status: "failed", message: e instanceof Error ? e.message : String(e) }); }
      } else {
        results.push({ key: K.sent, status: "manual", message: "Waiting on landing page URL" });
      }
    }

    return json({ success: true, clientProjectId, results });
  } catch (e) {
    console.error("[build-automation-01] error:", e);
    return json({ success: false, error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
