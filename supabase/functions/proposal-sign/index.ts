// Proposal signing edge function for App Development projects.
// Actions:
//   admin: list-admin, upload-url, create, void, delete
//   portal/admin: list, get, sign, download
// verify_jwt = false (public). Admin-only actions verify the caller's JWT against admin_users.
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { logProposalEvent } from "../_shared/proposal-events.ts";
import { PDFDocument, PDFFont, PDFPage, rgb, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "client-assets";
const PORTAL_BASE_URL =
  (Deno.env.get("PORTAL_BASE_URL") || "https://cre8visions.com").replace(/\/$/, "");

const FONTS = {
  serifRegular: "https://fonts.gstatic.com/s/lora/v37/0QI6MX1D_JOuGQbT0gvTJPa787weuyJG.ttf",
  serifBold: "https://fonts.gstatic.com/s/lora/v37/0QI6MX1D_JOuGQbT0gvTJPa787zAvCJG.ttf",
  serifItalic: "https://fonts.gstatic.com/s/lora/v37/0QI8MX1D_JOuMw_hLdO6T2wV9KnW-MoFkqg.ttf",
  body: "https://fonts.gstatic.com/s/karla/v33/qkBIXvYC6trAT55ZBi1ueQVIjQTD-JqqFA.ttf",
  script: "https://fonts.gstatic.com/s/greatvibes/v19/RWmMoKWR9v4ksMfaWd_JN-XCg6UKDXlq.ttf",
};

let cachedFonts: Record<string, Uint8Array> | null = null;
async function loadFonts() {
  if (cachedFonts) return cachedFonts;
  const entries = await Promise.all(
    Object.entries(FONTS).map(async ([k, url]) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Failed to fetch ${k}: ${r.status}`);
      return [k, new Uint8Array(await r.arrayBuffer())] as const;
    }),
  );
  cachedFonts = Object.fromEntries(entries);
  return cachedFonts;
}

// ---------- PDF stamping ----------
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 64;
const INK = rgb(0.10, 0.098, 0.086);
const TAUPE = rgb(0.45, 0.42, 0.37);
const BRONZE = rgb(0.6431, 0.4431, 0.2824);
const RULE = rgb(0.78, 0.74, 0.69);

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = (text ?? "").split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) line = trial;
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

interface StampInput {
  sourceBytes: Uint8Array;
  proposalTitle: string;
  proposalId: string;
  businessName: string;
  signature: { type: "typed" | "drawn"; name: string; data: string };
  signedAt: Date;
  agencyName: string;
  countersignedAt: Date;
  ip: string | null;
  userAgent: string | null;
  audit: any;
}

async function stampSignedProposal(input: StampInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input.sourceBytes, { ignoreEncryption: true });
  doc.registerFontkit(fontkit);
  const fontBytes = await loadFonts();
  const serif = await doc.embedFont(fontBytes.serifRegular);
  const serifBold = await doc.embedFont(fontBytes.serifBold);
  const serifItalic = await doc.embedFont(fontBytes.serifItalic);
  const body = await doc.embedFont(fontBytes.body);
  const script = await doc.embedFont(fontBytes.script);

  let drawn: PDFImage | undefined;
  if (input.signature.type === "drawn") {
    try {
      const b64 = input.signature.data.split(",")[1] ?? input.signature.data;
      const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      drawn = await doc.embedPng(bin);
    } catch (e) {
      console.warn("[proposal-sign] failed to embed drawn signature:", e);
    }
  }

  // ---------- Signature page ----------
  const sigPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 72;
  sigPage.drawText("CRE8 VISIONS, LLC", { x: MARGIN_X, y, size: 9, font: body, color: BRONZE });
  y -= 26;
  sigPage.drawText("Signature Page", { x: MARGIN_X, y, size: 22, font: serifBold, color: INK });
  y -= 18;
  sigPage.drawText(input.proposalTitle, { x: MARGIN_X, y, size: 11, font: serifItalic, color: TAUPE });
  y -= 22;
  sigPage.drawLine({ start: { x: MARGIN_X, y }, end: { x: PAGE_W - MARGIN_X, y }, thickness: 0.5, color: RULE });
  y -= 28;

  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const colW = (PAGE_W - MARGIN_X * 2 - 30) / 2;
  const drawBlock = (x: number, label: string, opts: {
    image?: PDFImage; scriptText?: string; printedName: string; meta: string[];
  }) => {
    let yy = y;
    sigPage.drawText(label.toUpperCase(), { x, y: yy, size: 8, font: body, color: BRONZE });
    yy -= 50;
    if (opts.image) {
      const maxH = 44;
      const ratio = opts.image.width / opts.image.height;
      const h = Math.min(maxH, opts.image.height);
      const w = Math.min(colW, h * ratio);
      sigPage.drawImage(opts.image, { x, y: yy, width: w, height: h });
    } else if (opts.scriptText) {
      sigPage.drawText(opts.scriptText, { x, y: yy + 6, size: 28, font: script, color: INK });
    }
    yy -= 8;
    sigPage.drawLine({ start: { x, y: yy }, end: { x: x + colW, y: yy }, thickness: 0.5, color: INK });
    yy -= 14;
    sigPage.drawText(opts.printedName, { x, y: yy, size: 10, font: serifBold, color: INK });
    yy -= 14;
    for (const m of opts.meta) {
      sigPage.drawText(m, { x, y: yy, size: 9, font: body, color: TAUPE });
      yy -= 12;
    }
  };

  drawBlock(MARGIN_X, "Client", {
    image: drawn,
    scriptText: drawn ? undefined : input.signature.name,
    printedName: input.signature.name,
    meta: [input.businessName, `Signed ${fmtDate(input.signedAt)}`, ...(input.ip ? [`IP ${input.ip}`] : [])],
  });
  drawBlock(MARGIN_X + colW + 30, "Agency", {
    scriptText: input.agencyName,
    printedName: input.agencyName,
    meta: ["Cre8 Visions, LLC", `Countersigned ${fmtDate(input.countersignedAt)}`],
  });

  // ---------- Audit page ----------
  const auditPage = doc.addPage([PAGE_W, PAGE_H]);
  let ay = PAGE_H - 72;
  auditPage.drawText("CRE8 VISIONS, LLC", { x: MARGIN_X, y: ay, size: 9, font: body, color: BRONZE });
  ay -= 26;
  auditPage.drawText("Electronic Signature Certificate", { x: MARGIN_X, y: ay, size: 20, font: serifBold, color: INK });
  ay -= 24;
  auditPage.drawText(
    "This certificate documents the electronic execution of the foregoing proposal",
    { x: MARGIN_X, y: ay, size: 10, font: serifItalic, color: TAUPE },
  );
  ay -= 12;
  auditPage.drawText(
    "and constitutes the audit record relied upon for legal validity (E-SIGN Act / UETA).",
    { x: MARGIN_X, y: ay, size: 10, font: serifItalic, color: TAUPE },
  );
  ay -= 18;
  auditPage.drawLine({ start: { x: MARGIN_X, y: ay }, end: { x: PAGE_W - MARGIN_X, y: ay }, thickness: 0.5, color: RULE });
  ay -= 16;

  const fmtDT = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-US", {
        year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
      });
    } catch { return iso; }
  };

  const drawKV = (label: string, value: string) => {
    const labelW = 130;
    const valueMaxW = PAGE_W - MARGIN_X * 2 - labelW;
    const lines = wrapText(value || "—", body, 9.5, valueMaxW);
    auditPage.drawText(label.toUpperCase(), { x: MARGIN_X, y: ay - 8, size: 8, font: body, color: BRONZE });
    let yy = ay - 9.5;
    for (const ln of lines) {
      auditPage.drawText(ln, { x: MARGIN_X + labelW, y: yy, size: 9.5, font: body, color: INK });
      yy -= 13;
    }
    ay -= Math.max(13, lines.length * 13) + 4;
  };

  const drawSubhead = (text: string) => {
    ay -= 6;
    auditPage.drawText(text, { x: MARGIN_X, y: ay - 11, size: 11, font: serifBold, color: INK });
    ay -= 18;
  };

  const a = input.audit ?? {};
  drawSubhead("Document");
  drawKV("Proposal", input.proposalTitle);
  drawKV("Proposal ID", input.proposalId);
  drawKV("Client", input.businessName);
  drawKV("Signatory", input.signature.name);

  drawSubhead("Signature Event");
  drawKV("Method", input.signature.type === "drawn" ? "Hand-drawn (canvas, PNG)" : "Typed name");
  drawKV("Consent", "Signatory affirmatively checked the consent box and clicked Sign.");
  drawKV("Signed At (UTC)", fmtDT(input.signedAt.toISOString()));
  if (a.signedAtLocal) drawKV("Signed At (Local)", a.signedAtLocal);
  drawKV("Countersigned (UTC)", fmtDT(input.countersignedAt.toISOString()));
  drawKV("Countersigner", `${input.agencyName} for Cre8 Visions, LLC`);

  drawSubhead("Network & Origin");
  drawKV("IP Address", input.ip || "Not captured");
  drawKV("Page URL", a.pageUrl || "—");
  drawKV("Referrer", a.referrer || "—");

  drawSubhead("Device & Browser");
  drawKV("User Agent", a.userAgent || input.userAgent || "—");
  drawKV("Platform", a.platform || "—");
  drawKV("Language", a.language || "—");
  if (a.timezone) drawKV("Timezone", `${a.timezone} (${a.timezoneOffset || ""})`.trim());
  if (a.screen) {
    const s = a.screen;
    drawKV("Screen", `${s.width ?? "?"} x ${s.height ?? "?"} px @${s.pixelRatio ?? 1}x, ${s.colorDepth ?? "?"}-bit`);
  }
  if (a.viewport) drawKV("Viewport", `${a.viewport.width ?? "?"} x ${a.viewport.height ?? "?"} px`);

  return await doc.save();
}

// ---------- Helpers ----------
function getClientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

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

// ---------- Schemas ----------
const ListSchema = z.object({
  action: z.literal("list"),
  clientId: z.string().uuid(),
  clientProjectId: z.string().uuid().optional(),
});
const UploadUrlSchema = z.object({
  action: z.literal("upload-url"),
  clientId: z.string().uuid(),
  clientProjectId: z.string().uuid(),
  filename: z.string().min(1).max(200),
});
const CreateSchema = z.object({
  action: z.literal("create"),
  clientId: z.string().uuid(),
  clientProjectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  sourcePdfPath: z.string().min(1).max(500),
});
const GetSchema = z.object({
  action: z.literal("get"),
  clientId: z.string().uuid(),
  proposalId: z.string().uuid(),
});
const SignSchema = z.object({
  action: z.literal("sign"),
  clientId: z.string().uuid(),
  proposalId: z.string().uuid(),
  signatureType: z.enum(["typed", "drawn"]),
  signatureName: z.string().trim().min(2).max(120),
  signatureData: z.string().min(1).max(400_000),
  agreed: z.literal(true),
  audit: z.record(z.any()).optional(),
});
const DownloadSchema = z.object({
  action: z.literal("download"),
  clientId: z.string().uuid(),
  proposalId: z.string().uuid(),
  variant: z.enum(["source", "signed"]).default("signed"),
});
// Declining is a portal action, guarded the same way signing is: the caller has
// to hold the client id, and has to say so explicitly. `confirm` mirrors
// `agreed` on the sign path so a stray or replayed call cannot close a proposal
// nobody meant to close.
// Telling the client a proposal is waiting. Admin-only, and deliberately a
// separate step from uploading one: `create` marks a proposal 'sent' so the
// portal will show it, but nothing was ever sent — no email, no SureContact
// activity, no send date. That gap is why a proposal could sit unread for two
// weeks while our own records said it had gone out, and why no follow-up could
// be scheduled: every threshold measures from a sent_at that was never written.
const NotifySchema = z.object({
  action: z.literal("notify"),
  clientId: z.string().uuid(),
  proposalId: z.string().uuid(),
  /** Optional line from Bree, shown above the button. */
  note: z.string().trim().max(1000).optional(),
  /** Defaults to the client's contact_email. */
  to: z.string().email().optional(),
});
const DeclineSchema = z.object({
  action: z.literal("decline"),
  clientId: z.string().uuid(),
  proposalId: z.string().uuid(),
  // Optional on purpose. Requiring a reason to say no produces "n/a".
  reason: z.string().trim().max(2000).optional(),
  confirm: z.literal(true),
});
const VoidSchema = z.object({
  action: z.literal("void"),
  clientId: z.string().uuid(),
  proposalId: z.string().uuid(),
});
const DeleteSchema = z.object({
  action: z.literal("delete"),
  clientId: z.string().uuid(),
  proposalId: z.string().uuid(),
});

const ActivitySchema = z.object({
  action: z.literal("activity"),
  clientId: z.string().uuid(),
  proposalId: z.string().uuid(),
});

const ActionSchema = z.discriminatedUnion("action", [
  ListSchema, UploadUrlSchema, CreateSchema, GetSchema, SignSchema, DownloadSchema, VoidSchema,
  DeleteSchema, ActivitySchema, DeclineSchema, NotifySchema,
]);

const ADMIN_ONLY = new Set(["upload-url", "create", "void", "delete", "activity", "notify"]);

const PROPOSAL_COLS =
  "id, client_id, client_project_id, title, description, status, source_pdf_path, " +
  "content, sent_at, sent_to, first_opened_at, first_viewed_at, last_activity_at, " +
  "next_followup_at, followup_count, " +
  "declined_at, decline_reason, " +
  "client_signature_name, client_signature_type, client_signed_at, " +
  "agency_signer_name, agency_countersigned_at, signed_pdf_path, pdf_generated_at, " +
  "created_at, updated_at";

// ---------- Handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const body = await req.json();
    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const input = parsed.data;

    if (ADMIN_ONLY.has(input.action)) {
      const ok = await isCallerAdmin(req, supabase);
      if (!ok) {
        return new Response(JSON.stringify({ error: "Admin only" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const { data: client, error: clientErr } = await supabase
      .from("clients").select("id, business_name, contact_name, contact_email, archived")
      .eq("id", input.clientId).maybeSingle();
    if (clientErr) throw clientErr;
    if (!client || client.archived) {
      return new Response(JSON.stringify({ error: "Client not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const respond = (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const signedUrl = async (path: string | null) => {
      if (!path) return null;
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    };

    if (input.action === "list") {
      let q = supabase.from("client_proposals").select(PROPOSAL_COLS)
        .eq("client_id", input.clientId).order("created_at", { ascending: false });
      if (input.clientProjectId) q = q.eq("client_project_id", input.clientProjectId);
      const { data, error } = await q;
      if (error) throw error;
      return respond({ proposals: data ?? [] });
    }

    if (input.action === "upload-url") {
      const proposalId = crypto.randomUUID();
      const path = `proposals/${input.clientId}/${proposalId}/source.pdf`;
      const { data, error } = await supabase.storage.from(BUCKET)
        .createSignedUploadUrl(path);
      if (error) throw error;
      return respond({ proposalId, path, token: data.token, signedUrl: data.signedUrl });
    }

    if (input.action === "create") {
      const { data, error } = await supabase.from("client_proposals").insert({
        client_id: input.clientId,
        client_project_id: input.clientProjectId,
        title: input.title,
        description: input.description ?? null,
        source_pdf_path: input.sourcePdfPath,
        status: "sent",
      }).select(PROPOSAL_COLS).single();
      if (error) throw error;
      await logProposalEvent(supabase, {
        proposal_id: data.id,
        client_id: input.clientId,
        event_type: "pdf_uploaded",
        actor: "admin",
        detail: { title: input.title, path: input.sourcePdfPath },
      });
      return respond({ proposal: data });
    }

    if (input.action === "get") {
      const { data: row, error } = await supabase.from("client_proposals")
        .select(PROPOSAL_COLS)
        .eq("id", input.proposalId).eq("client_id", input.clientId).maybeSingle();
      if (error) throw error;
      if (!row) return respond({ error: "Proposal not found" }, 404);
      const sourceUrl = await signedUrl(row.source_pdf_path);
      const signedPdfUrl = await signedUrl(row.signed_pdf_path);
      // Reading a proposal in the portal is the strongest engagement signal
      // there is — stronger than an open, stronger than a click — so it belongs
      // on the timeline even though nothing was emailed.
      if (row.status === "sent") {
        await logProposalEvent(supabase, {
          proposal_id: row.id,
          client_id: input.clientId,
          event_type: "viewed_in_portal",
          actor: "client",
          detail: { user_agent: req.headers.get("user-agent") },
        });
      }
      return respond({
        proposal: { ...row, source_url: sourceUrl, signed_pdf_url: signedPdfUrl },
        client: { id: client.id, business_name: client.business_name, contact_name: client.contact_name },
      });
    }

    if (input.action === "activity") {
      const { data, error } = await supabase.from("proposal_events")
        .select("id, event_type, actor, occurred_at, detail")
        .eq("proposal_id", input.proposalId)
        .order("occurred_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return respond({ events: data ?? [] });
    }

    if (input.action === "download") {
      const { data: row } = await supabase.from("client_proposals")
        .select("id, source_pdf_path, signed_pdf_path")
        .eq("id", input.proposalId).eq("client_id", input.clientId).maybeSingle();
      if (!row) return respond({ error: "Proposal not found" }, 404);
      const path = input.variant === "signed" ? row.signed_pdf_path : row.source_pdf_path;
      if (!path) return respond({ error: "No PDF available" }, 404);
      const url = await signedUrl(path);
      return respond({ pdfUrl: url });
    }

    if (input.action === "notify") {
      const { data: row } = await supabase.from("client_proposals")
        .select("id, title, status, client_project_id, sent_at, source_pdf_path, content")
        .eq("id", input.proposalId).eq("client_id", input.clientId).maybeSingle();
      if (!row) return respond({ error: "Proposal not found" }, 404);
      if (row.status === "signed") return respond({ error: "That proposal is already signed" }, 409);
      if (row.status === "voided") return respond({ error: "Proposal voided" }, 409);
      if (row.status === "declined") {
        return respond({ error: "The client declined this proposal" }, 409);
      }
      if (!row.source_pdf_path && !row.content) {
        // Sending someone to an empty document is worse than not sending.
        return respond({ error: "There is nothing to read yet — no PDF and no written content" }, 409);
      }

      const to = input.to || client.contact_email;
      if (!to) return respond({ error: "No contact email on this client" }, 409);

      const { data: proj } = row.client_project_id
        ? await supabase.from("client_projects").select("name")
          .eq("id", row.client_project_id).maybeSingle()
        : { data: null };

      const link = row.client_project_id
        ? `${PORTAL_BASE_URL}/portal/${input.clientId}/projects/${row.client_project_id}`
        : `${PORTAL_BASE_URL}/portal/${input.clientId}`;

      // Same path every other transactional email takes, so this one lands in
      // email_send_log and SureContact rather than being a second, invisible
      // way for mail to leave the building.
      const { error: sendErr } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "proposal-ready",
          recipientEmail: to,
          idempotencyKey: `proposal-ready-${row.id}-${to}-${Date.now()}`,
          templateData: {
            recipientName: client.contact_name ?? null,
            projectName: proj?.name ?? null,
            proposalTitle: row.title,
            portalUrl: link,
            fromName: "CRE8 Visions",
            note: input.note ?? null,
          },
        },
      });
      if (sendErr) {
        return respond({ error: `Could not send: ${sendErr.message ?? String(sendErr)}` }, 502);
      }

      // The send date is the point of all this. Without it 'sent' is a claim
      // with nothing behind it and no follow-up can be measured. Only set it
      // the first time, so re-notifying does not restart the clock and hide
      // how long the client has actually had it.
      const now = new Date().toISOString();
      const followupDays = 2;
      const update: Record<string, unknown> = {
        status: "sent",
        sent_to: to,
        updated_at: now,
        next_followup_at: new Date(Date.now() + followupDays * 86_400_000).toISOString(),
      };
      if (!row.sent_at) update.sent_at = now;

      const { error: uErr } = await supabase.from("client_proposals")
        .update(update).eq("id", row.id);
      if (uErr) throw uErr;

      await logProposalEvent(supabase, {
        proposal_id: row.id,
        client_id: input.clientId,
        event_type: "email_sent",
        actor: "admin",
        occurred_at: now,
        detail: { to, link, template: "proposal-ready", note: input.note ?? null },
      });

      return respond({
        success: true, to, link,
        sentAt: (update.sent_at as string) ?? row.sent_at,
        renotified: !!row.sent_at,
      });
    }

    if (input.action === "decline") {
      const { data: row } = await supabase.from("client_proposals")
        .select("id, status, title, client_project_id, declined_at")
        .eq("id", input.proposalId).eq("client_id", input.clientId).maybeSingle();
      if (!row) return respond({ error: "Proposal not found" }, 404);
      if (row.status === "signed") return respond({ error: "That proposal is already signed" }, 409);
      if (row.status === "voided") return respond({ error: "Proposal voided" }, 409);
      // Declining twice is the outcome that was wanted, so it is not an error.
      if (row.status === "declined") {
        return respond({ success: true, alreadyDeclined: true, declinedAt: row.declined_at });
      }

      const declinedAt = new Date().toISOString();
      const { error } = await supabase.from("client_proposals").update({
        status: "declined",
        declined_at: declinedAt,
        decline_reason: input.reason?.trim() || null,
        // A declined proposal is finished, so it drops out of every follow-up
        // bucket immediately rather than waiting for the next sweep. Chasing
        // someone for a decision they have already given is the exact failure
        // this whole path exists to prevent.
        next_followup_at: null,
        updated_at: declinedAt,
      }).eq("id", input.proposalId);
      if (error) throw error;

      await logProposalEvent(supabase, {
        proposal_id: row.id,
        client_id: input.clientId,
        event_type: "declined",
        actor: "client",
        occurred_at: declinedAt,
        detail: {
          reason: input.reason?.trim() || null,
          title: row.title,
          user_agent: req.headers.get("user-agent"),
        },
      });

      return respond({ success: true, status: "declined", declinedAt });
    }

    if (input.action === "void") {
      const { data: row } = await supabase.from("client_proposals")
        .select("id, status").eq("id", input.proposalId).eq("client_id", input.clientId).maybeSingle();
      if (!row) return respond({ error: "Not found" }, 404);
      if (row.status === "signed") return respond({ error: "Cannot void a signed proposal" }, 409);
      const { error } = await supabase.from("client_proposals")
        .update({ status: "voided" }).eq("id", input.proposalId);
      if (error) throw error;
      return respond({ success: true });
    }

    if (input.action === "delete") {
      const { data: row } = await supabase.from("client_proposals")
        .select("id, status, source_pdf_path").eq("id", input.proposalId).eq("client_id", input.clientId).maybeSingle();
      if (!row) return respond({ error: "Not found" }, 404);
      if (row.status === "signed") return respond({ error: "Cannot delete a signed proposal" }, 409);
      // best-effort source cleanup
      if (row.source_pdf_path) {
        await supabase.storage.from(BUCKET).remove([row.source_pdf_path]).catch(() => {});
      }
      const { error } = await supabase.from("client_proposals")
        .delete().eq("id", input.proposalId);
      if (error) throw error;
      return respond({ success: true });
    }

    if (input.action === "sign") {
      const { data: row, error } = await supabase.from("client_proposals")
        .select(PROPOSAL_COLS)
        .eq("id", input.proposalId).eq("client_id", input.clientId).maybeSingle();
      if (error) throw error;
      if (!row) return respond({ error: "Proposal not found" }, 404);
      if (row.status === "signed") return respond({ error: "Already signed" }, 409);
      if (row.status === "voided") return respond({ error: "Proposal voided" }, 409);
      if (input.signatureType === "drawn" && !input.signatureData.startsWith("data:image/png")) {
        return respond({ error: "Drawn signature must be a PNG data URL." }, 400);
      }

      // Download the source PDF
      const { data: src, error: dlErr } = await supabase.storage
        .from(BUCKET).download(row.source_pdf_path);
      if (dlErr || !src) throw dlErr ?? new Error("Source PDF missing");
      const sourceBytes = new Uint8Array(await src.arrayBuffer());

      const ip = getClientIp(req);
      const ua = req.headers.get("user-agent");
      const now = new Date();

      const signedBytes = await stampSignedProposal({
        sourceBytes,
        proposalTitle: row.title,
        proposalId: row.id,
        businessName: client.business_name ?? "Client",
        signature: { type: input.signatureType, name: input.signatureName, data: input.signatureData },
        signedAt: now,
        agencyName: row.agency_signer_name || "Tambria Kemp",
        countersignedAt: now,
        ip,
        userAgent: ua,
        audit: input.audit ?? null,
      });

      const signedPath = `proposals/${input.clientId}/${row.id}/signed.pdf`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(signedPath, signedBytes, {
        cacheControl: "3600", upsert: true, contentType: "application/pdf",
      });
      if (upErr) throw upErr;

      const { error: updErr } = await supabase.from("client_proposals").update({
        status: "signed",
        client_signature_name: input.signatureName,
        client_signature_type: input.signatureType,
        client_signature_data: input.signatureData,
        client_signed_at: now.toISOString(),
        client_ip: ip,
        client_user_agent: ua,
        client_audit: input.audit ?? null,
        agency_countersigned_at: now.toISOString(),
        signed_pdf_path: signedPath,
        pdf_generated_at: now.toISOString(),
        // Signing after a decline is a change of mind, and the best outcome
        // there is. Clear the decline rather than blocking the signature —
        // "I said no last week" must not be a trap that costs the work.
        declined_at: null,
        decline_reason: null,
      }).eq("id", row.id);
      if (updErr) throw updErr;

      await logProposalEvent(supabase, {
        proposal_id: row.id,
        client_id: input.clientId,
        event_type: "signed",
        actor: "client",
        occurred_at: now.toISOString(),
        detail: { name: input.signatureName, type: input.signatureType, ip },
      });
      await logProposalEvent(supabase, {
        proposal_id: row.id,
        client_id: input.clientId,
        event_type: "countersigned",
        actor: "admin",
        occurred_at: now.toISOString(),
        detail: { name: row.agency_signer_name || "Tambria Kemp" },
      });

      const signedPdfUrl = await signedUrl(signedPath);
      return respond({ success: true, proposalId: row.id, signedPdfUrl });
    }

    return respond({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("[proposal-sign] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
