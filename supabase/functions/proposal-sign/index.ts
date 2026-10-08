// Proposal signing edge function for App Development projects.
// Actions:
//   admin: list-admin, upload-url, create, void, delete
//   portal/admin: list, get, sign, download
// verify_jwt = false (public). Admin-only actions verify the caller's JWT against admin_users.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "zod";
import { logProposalEvent } from "../_shared/proposal-events.ts";
import { markDealLostForProposal, markDealSignedForProposal, syncProposalToSureContactDeal } from "../_shared/proposal-deal-sync.ts";
import { sendProjectInvoice } from "../_shared/surecart-invoices.ts";
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
  sourceSha256: string | null;
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

/**
 * Returns the final signed PDF plus the SHA-256 of the document through the
 * signature page (source + signature block), computed before the audit page
 * is appended. A hash can't describe the bytes it is itself printed on, so
 * this is the hash of everything legally operative — the audit page below it
 * is metadata about that signing, not part of what was signed.
 */
async function stampSignedProposal(input: StampInput): Promise<{ bytes: Uint8Array; signedSha256: string }> {
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

  // The hash of the document as signed — everything through the signature
  // page above, before the audit page below is appended. Computed here, not
  // after, so the certificate can print it without describing itself.
  const preAuditBytes = await doc.save();
  const signedDigest = await crypto.subtle.digest("SHA-256", preAuditBytes as BufferSource);
  const signedSha256 = Array.from(new Uint8Array(signedDigest)).map((b) => b.toString(16).padStart(2, "0")).join("");

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

  drawSubhead("Integrity");
  drawKV("Source PDF SHA-256", input.sourceSha256 ?? "Not recorded");
  drawKV("Signed PDF SHA-256", signedSha256);

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

  return { bytes: await doc.save(), signedSha256 };
}

// ---------- Helpers ----------
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
// One installment of a proposal's commercial terms. `amountValue` is a
// percentage (0-100) when amountType is 'percent', or whole cents when
// 'fixed'. Turned into a real project_invoices row at signature time, once
// totalCents is known to be final.
const PaymentTermItem = z.object({
  label: z.string().trim().min(1).max(120),
  trigger: z.enum(["on_signature", "on_completion", "date"]),
  amountType: z.enum(["percent", "fixed"]),
  amountValue: z.number().positive(),
  dueDate: z.string().nullable().optional(),
});
const CreateSchema = z.object({
  action: z.literal("create"),
  clientId: z.string().uuid(),
  clientProjectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  sourcePdfPath: z.string().min(1).max(500),
  // Required since CRE-287 — a proposal with no amount looked identical to
  // one that would auto-create a deposit schedule, which is how a $0 Menovia
  // reupload almost went out without the $5,000 anyone actually quoted.
  totalCents: z.number().int().min(1).max(100_000_000),
  paymentDueDays: z.number().int().min(0).max(365).optional(),
  paymentTerms: z.array(PaymentTermItem).max(20).optional(),
});
// Pairing two proposals that already exist: the old one is retired without
// being deleted, the new one becomes the one the client (and Bree) see as
// current. Used both by the upload dialog's "New version of…" picker and by
// the admin "Mark superseded by…" action on a row uploaded independently —
// which is also how the 9/23 and 10/6 Menovia proposals get linked after the
// fact, since neither was created through the other.
const SupersedeSchema = z.object({
  action: z.literal("supersede"),
  clientId: z.string().uuid(),
  proposalId: z.string().uuid(),
  supersededByProposalId: z.string().uuid(),
});
const MarkReadySchema = z.object({
  action: z.literal("mark-ready"),
  clientId: z.string().uuid(),
  proposalId: z.string().uuid(),
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
  ListSchema, UploadUrlSchema, CreateSchema, MarkReadySchema, GetSchema, SignSchema, DownloadSchema, VoidSchema,
  DeleteSchema, ActivitySchema, DeclineSchema, NotifySchema, SupersedeSchema,
]);

const ADMIN_ONLY = new Set(["upload-url", "create", "mark-ready", "void", "delete", "activity", "notify", "supersede"]);

const PROPOSAL_COLS =
  "id, client_id, client_project_id, title, description, status, source_pdf_path, " +
  "source_pdf_version, source_pdf_sha256, signed_pdf_sha256, " +
  "total_cents, currency, payment_due_days, payment_terms, " +
  "version, version_group_id, supersedes_id, " +
  "content, sent_at, sent_to, first_opened_at, first_viewed_at, last_activity_at, " +
  "next_followup_at, followup_count, " +
  "declined_at, decline_reason, " +
  "client_signature_name, client_signature_type, client_signed_at, " +
  "agency_signer_name, agency_countersigned_at, signed_pdf_path, pdf_generated_at, " +
  "created_at, updated_at";

/** For `list`/`get`/`download`: non-admin (portal) callers never see draft,
 *  voided or superseded proposals server-side — the browser used to be the
 *  only thing filtering those out, so a crafted request could read an
 *  internal draft, a withdrawn document, or an old version straight from the
 *  API (which is exactly how Dr. Kahin could still open and sign the 9/23
 *  Menovia proposal after the $5,000 one replaced it — the list endpoint
 *  handed it over, the portal UI just never showed it). */
const CLIENT_HIDDEN_STATUSES = ["draft", "ready", "voided", "superseded"];

const BREE_EMAIL = "info@cre8visions.com";

const formatCents = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "usd").toUpperCase() }).format(cents / 100);

interface PostSignatureResult {
  hasTerms: boolean;
  depositStatus: "sent" | "failed" | "none";
  errorDetail: string | null;
}

/**
 * Everything that happens after a signature lands: the schedule and its
 * invoices get created from the proposal's commercial terms, the on-signature
 * installment goes out through SureCart, and both the client and Bree get
 * told what happened — including when it didn't work, because a signature
 * that goes through silently is worse than one that's loud about a problem.
 */
async function runPostSignatureAutomation(
  supabase: any,
  opts: { proposal: any; client: any; signedPdfUrl: string | null },
): Promise<PostSignatureResult> {
  const { proposal, client, signedPdfUrl } = opts;
  const adminUrl = `${PORTAL_BASE_URL}/admin/clients/${proposal.client_id}/projects/${proposal.client_project_id}`;
  const currency = proposal.currency || "usd";
  const terms = Array.isArray(proposal.payment_terms) ? proposal.payment_terms : [];
  const hasTerms = !!(proposal.total_cents && terms.length);

  let depositStatus: "sent" | "failed" | "none" = "none";
  let depositAmountFormatted: string | null = null;
  let errorDetail: string | null = null;

  if (hasTerms) {
    try {
      const totalCents = proposal.total_cents as number;
      const items = terms.map((t: any) => ({
        label: t.label,
        trigger: t.trigger,
        due_date: t.trigger === "date" ? (t.dueDate ?? null) : null,
        amount_cents: t.amountType === "percent"
          ? Math.round(totalCents * (t.amountValue / 100))
          : Math.round(t.amountValue),
      }));

      const { data: schedule, error: schErr } = await supabase.from("payment_schedules").insert({
        client_id: proposal.client_id,
        client_project_id: proposal.client_project_id,
        proposal_id: proposal.id,
        title: `${proposal.title} — Payment Schedule`,
        total_cents: totalCents,
        currency,
        status: "active",
        source: "proposal",
      }).select("id").single();
      if (schErr) throw schErr;

      const inserts = items.map((it: any, idx: number) => ({
        client_id: proposal.client_id,
        client_project_id: proposal.client_project_id,
        schedule_id: schedule.id,
        proposal_id: proposal.id,
        sequence: idx + 1,
        label: it.label,
        amount_cents: it.amount_cents,
        currency,
        trigger: it.trigger,
        due_date: it.due_date,
        due_days: proposal.payment_due_days ?? null,
        status: "scheduled",
      }));
      const { data: invoiceRows, error: insErr } = await supabase.from("project_invoices")
        .insert(inserts).select("id, trigger, amount_cents, due_days");
      if (insErr) throw insErr;

      const depositRow = (invoiceRows ?? []).find((r: any) => r.trigger === "on_signature");
      if (depositRow) {
        const dueDate = depositRow.due_days
          ? new Date(Date.now() + depositRow.due_days * 86_400_000).toISOString().slice(0, 10)
          : null;
        try {
          await sendProjectInvoice(supabase, { invoiceId: depositRow.id, clientId: proposal.client_id, dueDate });
          depositStatus = "sent";
          depositAmountFormatted = formatCents(depositRow.amount_cents, currency);
        } catch (e) {
          depositStatus = "failed";
          errorDetail = e instanceof Error ? e.message : String(e);
        }
      }
    } catch (e) {
      errorDetail = e instanceof Error ? e.message : String(e);
      console.error("[proposal-sign] schedule creation failed:", e);
    }
  }

  if (client.contact_email) {
    try {
      const { error: sendErr } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "proposal-signed-client",
          recipientEmail: client.contact_email,
          idempotencyKey: `proposal-signed-client-${proposal.id}`,
          templateData: {
            recipientName: client.contact_name ?? null,
            proposalTitle: proposal.title,
            signedPdfUrl,
            depositStatus: !hasTerms ? "none" : depositStatus === "sent" ? "sent" : "pending",
            depositAmountFormatted,
            fromName: "CRE8 Visions",
          },
        },
      });
      if (sendErr) console.error("[proposal-sign] client signed-email failed:", sendErr);
    } catch (e) {
      console.error("[proposal-sign] client signed-email threw:", e);
    }
  } else {
    errorDetail = (errorDetail ? `${errorDetail}; ` : "") + "client has no contact email on file";
  }

  try {
    const { error: sendErr } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "proposal-signed-admin",
        recipientEmail: BREE_EMAIL,
        idempotencyKey: `proposal-signed-admin-${proposal.id}`,
        templateData: {
          clientName: client.business_name || client.contact_name || "A client",
          proposalTitle: proposal.title,
          adminUrl,
          hasTerms,
          depositStatus: hasTerms ? depositStatus : "none",
          depositAmountFormatted,
          errorDetail,
        },
      },
    });
    if (sendErr) console.error("[proposal-sign] admin signed-email failed:", sendErr);
  } catch (e) {
    console.error("[proposal-sign] admin signed-email threw:", e);
  }

  return { hasTerms, depositStatus, errorDetail };
}

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

    // Computed once: `list`/`get`/`download` use it to decide what a non-admin
    // caller is allowed to see, and the admin-only gate below reuses it rather
    // than checking the JWT twice.
    const callerIsAdmin = await isCallerAdmin(req, supabase);

    if (ADMIN_ONLY.has(input.action) && !callerIsAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
      if (!callerIsAdmin) q = q.not("status", "in", `(${CLIENT_HIDDEN_STATUSES.join(",")})`);
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
      // Hashed now, while the bytes are known-good from the upload — not
      // recomputed later from whatever happens to be at this path, which is
      // the one thing that must never silently change under a sent proposal.
      let sourceSha256: string | null = null;
      try {
        const { data: src } = await supabase.storage.from(BUCKET).download(input.sourcePdfPath);
        if (src) sourceSha256 = await sha256Hex(new Uint8Array(await src.arrayBuffer()));
      } catch (e) {
        console.warn("[proposal-sign] could not hash source PDF:", e);
      }

      const { data, error } = await supabase.from("client_proposals").insert({
        client_id: input.clientId,
        client_project_id: input.clientProjectId,
        title: input.title,
        description: input.description ?? null,
        source_pdf_path: input.sourcePdfPath,
        source_pdf_sha256: sourceSha256,
        // Draft until the commercial terms (if any) are confirmed and the
        // Send email actually goes out — uploading a PDF is not the same
        // as telling a client it exists. See `notify` for the only path
        // that sets 'sent'.
        status: input.paymentTerms?.length ? "ready" : "draft",
        total_cents: input.totalCents ?? null,
        payment_due_days: input.paymentDueDays ?? null,
        payment_terms: input.paymentTerms ?? null,
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

    if (input.action === "mark-ready") {
      const { data: row } = await supabase.from("client_proposals")
        .select("id, status").eq("id", input.proposalId).eq("client_id", input.clientId).maybeSingle();
      if (!row) return respond({ error: "Not found" }, 404);
      if (row.status !== "draft") return respond({ error: `Cannot mark ready from status ${row.status}` }, 409);
      const { error } = await supabase.from("client_proposals").update({ status: "ready" }).eq("id", input.proposalId);
      if (error) throw error;
      return respond({ success: true });
    }

    if (input.action === "supersede") {
      const { data: oldRow } = await supabase.from("client_proposals")
        .select("id, status, version, version_group_id")
        .eq("id", input.proposalId).eq("client_id", input.clientId).maybeSingle();
      if (!oldRow) return respond({ error: "Proposal not found" }, 404);
      if (oldRow.status === "signed") return respond({ error: "Cannot supersede a signed proposal" }, 409);
      if (oldRow.status === "superseded") return respond({ error: "That proposal is already superseded" }, 409);

      const { data: newRow } = await supabase.from("client_proposals")
        .select("id, status, version, version_group_id")
        .eq("id", input.supersededByProposalId).eq("client_id", input.clientId).maybeSingle();
      if (!newRow) return respond({ error: "Replacement proposal not found" }, 404);
      if (newRow.id === oldRow.id) return respond({ error: "A proposal cannot supersede itself" }, 400);

      // Every row already carries a version_group_id (set on insert, see the
      // trigger). The older of the two groups wins as the thread's identity
      // so repeated "mark superseded" calls on the same chain keep landing on
      // one group instead of forking a new one each time.
      const groupId = oldRow.version_group_id ?? oldRow.id;
      const oldVersion = oldRow.version ?? 1;
      const newVersion = Math.max(newRow.version ?? 1, oldVersion + 1);

      const { error: e1 } = await supabase.from("client_proposals")
        .update({ status: "superseded", version_group_id: groupId, version: oldVersion })
        .eq("id", oldRow.id);
      if (e1) throw e1;

      const { error: e2 } = await supabase.from("client_proposals")
        .update({ version_group_id: groupId, version: newVersion, supersedes_id: oldRow.id })
        .eq("id", newRow.id);
      if (e2) throw e2;

      await logProposalEvent(supabase, {
        proposal_id: oldRow.id,
        client_id: input.clientId,
        event_type: "superseded",
        actor: "admin",
        detail: { superseded_by: newRow.id },
      });

      return respond({ success: true });
    }

    if (input.action === "get") {
      const { data: row, error } = await supabase.from("client_proposals")
        .select(PROPOSAL_COLS)
        .eq("id", input.proposalId).eq("client_id", input.clientId).maybeSingle();
      if (error) throw error;
      if (!row) return respond({ error: "Proposal not found" }, 404);
      if (!callerIsAdmin && CLIENT_HIDDEN_STATUSES.includes(row.status)) {
        return respond({ error: "Proposal not found" }, 404);
      }
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
        .select("id, status, source_pdf_path, signed_pdf_path")
        .eq("id", input.proposalId).eq("client_id", input.clientId).maybeSingle();
      if (!row) return respond({ error: "Proposal not found" }, 404);
      if (!callerIsAdmin && CLIENT_HIDDEN_STATUSES.includes(row.status)) {
        return respond({ error: "Proposal not found" }, 404);
      }
      const path = input.variant === "signed" ? row.signed_pdf_path : row.source_pdf_path;
      if (!path) return respond({ error: "No PDF available" }, 404);
      const url = await signedUrl(path);
      return respond({ pdfUrl: url });
    }

    if (input.action === "notify") {
      const { data: row } = await supabase.from("client_proposals")
        .select("id, title, status, client_project_id, sent_at, source_pdf_path, content, total_cents, version")
        .eq("id", input.proposalId).eq("client_id", input.clientId).maybeSingle();
      if (!row) return respond({ error: "Proposal not found" }, 404);
      if (row.status === "signed") return respond({ error: "That proposal is already signed" }, 409);
      if (row.status === "voided") return respond({ error: "Proposal voided" }, 409);
      if (row.status === "declined") {
        return respond({ error: "The client declined this proposal" }, 409);
      }
      if (row.status === "superseded") {
        return respond({ error: "A newer version has replaced this proposal — send that one instead" }, 409);
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

      // Same path every other transactional email takes: rendered here,
      // enqueued, and dispatched by process-email-queue — which sends through
      // SureContact when the key is configured, so this lands on the contact's
      // timeline with opens and clicks rather than leaving the building
      // untracked. It did not before; the dispatcher handed everything to
      // Lovable's sender, which is why a delivered proposal was invisible in
      // SureContact.
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

      // CRE-286 hook: every send or resend of a proposal keeps the
      // SureContact deal amount current. Best-effort — a sync failure must
      // never be the reason a proposal send itself fails.
      try {
        await syncProposalToSureContactDeal(supabase, {
          proposalId: row.id,
          clientId: input.clientId,
          clientProjectId: row.client_project_id,
          title: row.title,
          totalCents: row.total_cents,
          isNewVersion: row.version > 1,
        });
      } catch (e) {
        console.error("[proposal-sign] deal sync failed:", e);
      }

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

      // CRE-286 hook: a decline is a Lost deal. Best-effort, same as notify.
      try {
        await markDealLostForProposal(supabase, {
          proposalId: row.id,
          clientProjectId: row.client_project_id,
          reason: `Proposal "${row.title}" declined` + (input.reason?.trim() ? ` — "${input.reason.trim()}"` : ""),
        });
      } catch (e) {
        console.error("[proposal-sign] deal-lost sync failed:", e);
      }

      return respond({ success: true, status: "declined", declinedAt });
    }

    if (input.action === "void") {
      const { data: row } = await supabase.from("client_proposals")
        .select("id, status, title, client_project_id")
        .eq("id", input.proposalId).eq("client_id", input.clientId).maybeSingle();
      if (!row) return respond({ error: "Not found" }, 404);
      if (row.status === "signed") return respond({ error: "Cannot void a signed proposal" }, 409);
      const { error } = await supabase.from("client_proposals")
        .update({ status: "voided" }).eq("id", input.proposalId);
      if (error) throw error;

      // CRE-286 hook: a voided proposal is a Lost deal. Best-effort, same as notify.
      try {
        await markDealLostForProposal(supabase, {
          proposalId: row.id,
          clientProjectId: row.client_project_id,
          reason: `Proposal "${row.title}" voided`,
        });
      } catch (e) {
        console.error("[proposal-sign] deal-lost sync failed:", e);
      }

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
      // A decline is final, and deliberately so. The price and the timeline in
      // this document were quoted for a decision made then; letting someone
      // sign it weeks later would bind us to numbers we may no longer be able
      // to honour. Coming back is welcome — it just needs a fresh proposal.
      if (row.status === "declined") {
        return respond({
          error: "This proposal was declined and can no longer be signed. " +
            "Ask us for a new one and we will re-quote it.",
        }, 409);
      }
      // A superseded proposal is exactly the bug CRE-287 closed: the terms on
      // it may be stale (no total, no payment schedule) and signing it would
      // bypass the deposit automation the current version is set up for.
      if (row.status === "superseded") {
        return respond({
          error: "A newer version of this proposal has replaced it and it can no longer be signed. " +
            "Ask us for the current version.",
        }, 409);
      }
      // Draft and ready are internal states — nothing has been sent to the
      // client yet, so there is no valid link for anyone to be signing from.
      if (row.status !== "sent") {
        return respond({ error: "This proposal has not been sent and cannot be signed yet." }, 409);
      }
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

      const { bytes: signedBytes, signedSha256 } = await stampSignedProposal({
        sourceBytes,
        sourceSha256: row.source_pdf_sha256 ?? null,
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
        signed_pdf_sha256: signedSha256,
        pdf_generated_at: now.toISOString(),
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

      // From here on: schedule + deposit invoice + both emails. Best-effort —
      // the signature itself is already durable, and a failure here must
      // reach Bree (fail loud), never silently swallow and never fail the
      // response the client is waiting on.
      const automation = await runPostSignatureAutomation(supabase, {
        proposal: row, client, signedPdfUrl,
      });

      // Best-effort, same as the schedule/invoice/email automation above —
      // a SureContact hiccup here must never fail the response the client
      // is waiting on. markDealSignedForProposal swallows its own errors.
      await markDealSignedForProposal(supabase, {
        proposalId: row.id,
        clientProjectId: row.client_project_id,
      });

      return respond({ success: true, proposalId: row.id, signedPdfUrl, automation });
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
