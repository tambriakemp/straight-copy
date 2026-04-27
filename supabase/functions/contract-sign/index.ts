// Public client-portal edge function for contract signing.
// Actions:
//   - get      : returns the active contract template + any existing signed record for a client
//   - sign     : records the client's signature, auto-countersigns, generates a PDF, and flips
//                the intake.contract_signed and intake.contract_countersigned checklist items.
//   - download : returns a fresh signed URL for an existing contract PDF.
//
// verify_jwt = false (public). Service role mediates all DB access.
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PDFDocument, PDFFont, PDFPage, rgb, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { getContractTemplate, type ContractTemplate } from "../_shared/contract-templates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FONTS = {
  serifRegular: "https://fonts.gstatic.com/s/lora/v37/0QI6MX1D_JOuGQbT0gvTJPa787weuyJG.ttf",
  serifBold: "https://fonts.gstatic.com/s/lora/v37/0QI6MX1D_JOuGQbT0gvTJPa787zAvCJG.ttf",
  serifItalic: "https://fonts.gstatic.com/s/lora/v37/0QI8MX1D_JOuMw_hLdO6T2wV9KnW-MoFkqg.ttf",
  body: "https://fonts.gstatic.com/s/karla/v33/qkBIXvYC6trAT55ZBi1ueQVIjQTD-JqqFA.ttf",
  // Great Vibes — script signature font
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

// ---------- PDF rendering ----------

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 64;
const MARGIN_Y_TOP = 72;
const MARGIN_Y_BOTTOM = 72;
const INK = rgb(0.10, 0.098, 0.086);
const TAUPE = rgb(0.45, 0.42, 0.37);
const BRONZE = rgb(0.6431, 0.4431, 0.2824);
const RULE = rgb(0.78, 0.74, 0.69);

interface Fonts {
  serif: PDFFont;
  serifBold: PDFFont;
  serifItalic: PDFFont;
  body: PDFFont;
  script: PDFFont;
}

interface Cursor {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  fonts: Fonts;
}

function newPage(c: Cursor) {
  c.page = c.doc.addPage([PAGE_W, PAGE_H]);
  c.y = PAGE_H - MARGIN_Y_TOP;
  drawFooter(c);
}

function drawFooter(c: Cursor) {
  const text = "Cre8 Visions, LLC — Service Agreement";
  c.page.drawText(text, {
    x: MARGIN_X,
    y: 36,
    size: 8,
    font: c.fonts.body,
    color: TAUPE,
  });
  const pageNum = `${c.doc.getPageCount()}`;
  const w = c.fonts.body.widthOfTextAtSize(pageNum, 8);
  c.page.drawText(pageNum, {
    x: PAGE_W - MARGIN_X - w,
    y: 36,
    size: 8,
    font: c.fonts.body,
    color: TAUPE,
  });
}

function ensureSpace(c: Cursor, needed: number) {
  if (c.y - needed < MARGIN_Y_BOTTOM) newPage(c);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const trial = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      line = trial;
    } else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawHeading(c: Cursor, text: string) {
  ensureSpace(c, 28);
  c.y -= 6;
  c.page.drawText(text, {
    x: MARGIN_X,
    y: c.y - 12,
    size: 12,
    font: c.fonts.serifBold,
    color: INK,
  });
  c.y -= 22;
}

function drawBody(c: Cursor, text: string) {
  const size = 10;
  const lineHeight = 14;
  const maxW = PAGE_W - MARGIN_X * 2;
  const lines = wrapText(text, c.fonts.body, size, maxW);
  for (const ln of lines) {
    ensureSpace(c, lineHeight);
    c.page.drawText(ln, {
      x: MARGIN_X,
      y: c.y - size,
      size,
      font: c.fonts.body,
      color: INK,
    });
    c.y -= lineHeight;
  }
  c.y -= 8;
}

function drawHorizontalRule(c: Cursor) {
  ensureSpace(c, 12);
  c.page.drawLine({
    start: { x: MARGIN_X, y: c.y },
    end: { x: PAGE_W - MARGIN_X, y: c.y },
    thickness: 0.5,
    color: RULE,
  });
  c.y -= 12;
}

interface SignatureBlock {
  label: string;
  signature: { kind: "script-text" | "image"; value: string; image?: PDFImage };
  printedName: string;
  meta: string[];
}

function drawSignatureBlock(c: Cursor, block: SignatureBlock, x: number, blockWidth: number) {
  const size = 9;
  // Eyebrow label
  c.page.drawText(block.label.toUpperCase(), {
    x,
    y: c.y - size,
    size: 7.5,
    font: c.fonts.body,
    color: BRONZE,
  });
  let blockY = c.y - 16;
  // Signature area (60pt tall)
  const sigBottom = blockY - 60;
  if (block.signature.kind === "script-text") {
    const fontSize = 32;
    c.page.drawText(block.signature.value, {
      x,
      y: sigBottom + 14,
      size: fontSize,
      font: c.fonts.script,
      color: INK,
    });
  } else if (block.signature.kind === "image" && block.signature.image) {
    const img = block.signature.image;
    const maxH = 50;
    const maxW = blockWidth;
    const ratio = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    c.page.drawImage(img, {
      x,
      y: sigBottom + 8,
      width: w,
      height: h,
    });
  }
  // Signature line
  c.page.drawLine({
    start: { x, y: sigBottom },
    end: { x: x + blockWidth, y: sigBottom },
    thickness: 0.75,
    color: INK,
  });
  // Printed name
  c.page.drawText(block.printedName, {
    x,
    y: sigBottom - 12,
    size,
    font: c.fonts.serifBold,
    color: INK,
  });
  // Meta
  let metaY = sigBottom - 26;
  for (const m of block.meta) {
    c.page.drawText(m, {
      x,
      y: metaY,
      size: 8,
      font: c.fonts.body,
      color: TAUPE,
    });
    metaY -= 11;
  }
}

interface AuditData {
  userAgent?: string;
  platform?: string;
  language?: string;
  languages?: string[];
  timezone?: string;
  timezoneOffset?: string;
  screen?: { width?: number | null; height?: number | null; pixelRatio?: number | null; colorDepth?: number | null };
  viewport?: { width?: number | null; height?: number | null };
  referrer?: string;
  pageUrl?: string;
  signedAtLocal?: string;
  signedAtIso?: string;
}

interface RenderInput {
  template: ContractTemplate;
  businessName: string;
  clientName: string;
  clientSignature: { type: "typed" | "drawn"; data: string; name: string };
  signedAt: Date;
  agencyName: string;
  countersignedAt: Date;
  ip: string | null;
  userAgent?: string | null;
  audit?: AuditData | null;
  contractId?: string;
  templateVersion?: string;
}

export async function renderContractPdf(input: RenderInput): Promise<Uint8Array> {
  const fontBytes = await loadFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts: Fonts = {
    serif: await doc.embedFont(fontBytes.serifRegular, { subset: true }),
    serifBold: await doc.embedFont(fontBytes.serifBold, { subset: true }),
    serifItalic: await doc.embedFont(fontBytes.serifItalic, { subset: true }),
    body: await doc.embedFont(fontBytes.body, { subset: true }),
    // Great Vibes uses contextual alternates / ligatures — disable subsetting
    // so all glyphs in the signed name render correctly (avoids "only one
    // letter shows" issue with pdf-lib subsetting).
    script: await doc.embedFont(fontBytes.script, { subset: false }),
  };

  const c: Cursor = { doc, page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H - MARGIN_Y_TOP, fonts };
  drawFooter(c);

  // Header
  c.page.drawText("CRE8 VISIONS, LLC", {
    x: MARGIN_X,
    y: c.y - 9,
    size: 9,
    font: c.fonts.body,
    color: BRONZE,
  });
  c.y -= 26;

  c.page.drawText(input.template.title, {
    x: MARGIN_X,
    y: c.y - 22,
    size: 22,
    font: c.fonts.serifBold,
    color: INK,
  });
  c.y -= 36;

  c.page.drawText(input.template.effectiveLine, {
    x: MARGIN_X,
    y: c.y - 10,
    size: 10,
    font: c.fonts.serifItalic,
    color: TAUPE,
  });
  c.y -= 18;

  c.page.drawText(`Client: ${input.businessName}`, {
    x: MARGIN_X,
    y: c.y - 10,
    size: 10,
    font: c.fonts.body,
    color: INK,
  });
  c.y -= 16;
  c.page.drawText(`Version: ${input.template.version}`, {
    x: MARGIN_X,
    y: c.y - 10,
    size: 9,
    font: c.fonts.body,
    color: TAUPE,
  });
  c.y -= 22;
  drawHorizontalRule(c);

  // Sections
  for (const section of input.template.sections) {
    drawHeading(c, section.heading);
    drawBody(c, section.body);
  }

  // Signatures (always start on a new section, push to next page if tight)
  ensureSpace(c, 180);
  drawHorizontalRule(c);
  c.page.drawText("SIGNATURES", {
    x: MARGIN_X,
    y: c.y - 9,
    size: 9,
    font: c.fonts.serifBold,
    color: BRONZE,
  });
  c.y -= 28;

  // Embed client drawn signature if applicable
  let clientSigImage: PDFImage | undefined;
  if (input.clientSignature.type === "drawn") {
    try {
      const dataUrl = input.clientSignature.data;
      const base64 = dataUrl.split(",")[1] ?? dataUrl;
      const bin = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
      // Drawn signatures are always PNG from canvas.toDataURL()
      clientSigImage = await doc.embedPng(bin);
    } catch (e) {
      console.warn("[contract-sign] failed to embed drawn signature:", e);
    }
  }

  const colWidth = (PAGE_W - MARGIN_X * 2 - 30) / 2;
  const leftX = MARGIN_X;
  const rightX = MARGIN_X + colWidth + 30;
  const blockTop = c.y;
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Client block
  drawSignatureBlock(
    { ...c, y: blockTop },
    {
      label: "Client",
      signature:
        clientSigImage
          ? { kind: "image", value: "", image: clientSigImage }
          : { kind: "script-text", value: input.clientSignature.name },
      printedName: input.clientSignature.name,
      meta: [
        input.businessName,
        `Signed ${fmtDate(input.signedAt)}`,
        ...(input.ip ? [`IP ${input.ip}`] : []),
      ],
    },
    leftX,
    colWidth,
  );

  // Agency block (always script-rendered name)
  drawSignatureBlock(
    { ...c, y: blockTop },
    {
      label: "Agency",
      signature: { kind: "script-text", value: input.agencyName },
      printedName: input.agencyName,
      meta: ["Cre8 Visions, LLC", `Countersigned ${fmtDate(input.countersignedAt)}`],
    },
    rightX,
    colWidth,
  );

  // ---------- Electronic Signature Audit Page ----------
  newPage(c);
  c.page.drawText("CRE8 VISIONS, LLC", {
    x: MARGIN_X, y: c.y - 9, size: 9, font: c.fonts.body, color: BRONZE,
  });
  c.y -= 26;
  c.page.drawText("Electronic Signature Certificate", {
    x: MARGIN_X, y: c.y - 20, size: 20, font: c.fonts.serifBold, color: INK,
  });
  c.y -= 30;
  c.page.drawText(
    "This certificate documents the electronic execution of the foregoing Agreement",
    { x: MARGIN_X, y: c.y - 10, size: 10, font: c.fonts.serifItalic, color: TAUPE },
  );
  c.y -= 14;
  c.page.drawText(
    "and constitutes the audit record relied upon for legal validity (E-SIGN Act / UETA).",
    { x: MARGIN_X, y: c.y - 10, size: 10, font: c.fonts.serifItalic, color: TAUPE },
  );
  c.y -= 22;
  drawHorizontalRule(c);

  const fmtDateTime = (iso?: string) => {
    if (!iso) return "—";
    try {
      const d = new Date(iso);
      return d.toLocaleString("en-US", {
        year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        timeZoneName: "short",
      });
    } catch { return iso; }
  };

  const drawKV = (label: string, value: string) => {
    const labelSize = 8;
    const valueSize = 9.5;
    const lineHeight = 13;
    const labelW = 130;
    const valueMaxW = PAGE_W - MARGIN_X * 2 - labelW;
    const lines = wrapText(value || "—", c.fonts.body, valueSize, valueMaxW);
    ensureSpace(c, lines.length * lineHeight + 4);
    c.page.drawText(label.toUpperCase(), {
      x: MARGIN_X, y: c.y - labelSize, size: labelSize, font: c.fonts.body, color: BRONZE,
    });
    let yy = c.y - valueSize;
    for (const ln of lines) {
      c.page.drawText(ln, {
        x: MARGIN_X + labelW, y: yy, size: valueSize, font: c.fonts.body, color: INK,
      });
      yy -= lineHeight;
    }
    c.y -= Math.max(lineHeight, lines.length * lineHeight) + 4;
  };

  const drawSubhead = (text: string) => {
    ensureSpace(c, 24);
    c.y -= 6;
    c.page.drawText(text, {
      x: MARGIN_X, y: c.y - 11, size: 11, font: c.fonts.serifBold, color: INK,
    });
    c.y -= 18;
  };

  const a = input.audit ?? {};
  const sig = input.clientSignature;

  drawSubhead("Document");
  drawKV("Agreement", input.template.title);
  drawKV("Template Version", input.templateVersion || input.template.version);
  if (input.contractId) drawKV("Contract ID", input.contractId);
  drawKV("Client", input.businessName);
  drawKV("Signatory", sig.name);

  drawSubhead("Signature Event");
  drawKV("Method", sig.type === "drawn" ? "Hand-drawn (canvas, PNG)" : "Typed name");
  drawKV("Consent", "Signatory affirmatively checked the consent box and clicked Sign.");
  drawKV("Signed At (UTC)", fmtDateTime(input.signedAt.toISOString()));
  if (a.signedAtLocal) drawKV("Signed At (Local)", a.signedAtLocal);
  drawKV("Countersigned (UTC)", fmtDateTime(input.countersignedAt.toISOString()));
  drawKV("Countersigner", `${input.agencyName} for Cre8 Visions, LLC`);

  drawSubhead("Network & Origin");
  drawKV("IP Address", input.ip || "Not captured");
  drawKV("Page URL", a.pageUrl || "—");
  drawKV("Referrer", a.referrer || "—");

  drawSubhead("Device & Browser");
  drawKV("User Agent", a.userAgent || input.userAgent || "—");
  drawKV("Platform", a.platform || "—");
  drawKV("Language", a.language || "—");
  if (a.languages && a.languages.length) drawKV("Languages", a.languages.join(", "));
  drawKV("Timezone", a.timezone ? `${a.timezone} (${a.timezoneOffset || ""})`.trim() : "—");
  if (a.screen) {
    const s = a.screen;
    drawKV(
      "Screen",
      `${s.width ?? "?"} x ${s.height ?? "?"} px @${s.pixelRatio ?? 1}x, ${s.colorDepth ?? "?"}-bit`,
    );
  }
  if (a.viewport) {
    drawKV("Viewport", `${a.viewport.width ?? "?"} x ${a.viewport.height ?? "?"} px`);
  }

  c.y -= 8;
  drawHorizontalRule(c);
  drawBody(
    c,
    "By electronically signing the Agreement, the signatory consented to do business electronically and " +
      "agreed that their typed or drawn signature constitutes a legally binding signature equivalent to a " +
      "handwritten signature under the U.S. E-SIGN Act (15 U.S.C. ch. 96) and the Uniform Electronic " +
      "Transactions Act (UETA), as well as comparable laws of the signatory's jurisdiction. Cre8 Visions, " +
      "LLC retains this audit record together with the executed Agreement as evidence of the parties' " +
      "intent to be bound.",
  );

  return await doc.save();
}

// ---------- Helpers ----------

function getClientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip");
}

function flipChecklistItems(checklist: any[], keys: string[]): any[] {
  if (!Array.isArray(checklist)) return checklist;
  return checklist.map((it: any) => {
    if (!it || typeof it !== "object") return it;
    if (keys.includes(it.key)) return { ...it, done: true };
    return it;
  });
}

async function flipIntakeChecklist(supabase: any, clientId: string) {
  const { data: intakeNode } = await supabase
    .from("journey_nodes")
    .select("id, checklist")
    .eq("client_id", clientId)
    .eq("key", "intake")
    .maybeSingle();
  if (!intakeNode) return;
  const next = flipChecklistItems(intakeNode.checklist as any[], [
    "intake.contract_signed",
    "intake.contract_countersigned",
  ]);
  await supabase.from("journey_nodes").update({ checklist: next }).eq("id", intakeNode.id);
}

// ---------- Schemas ----------

const GetSchema = z.object({
  action: z.literal("get"),
  clientId: z.string().uuid(),
});

const SignSchema = z.object({
  action: z.literal("sign"),
  clientId: z.string().uuid(),
  signatureType: z.enum(["typed", "drawn"]),
  signatureName: z.string().trim().min(2).max(120),
  // typed: just the name; drawn: PNG data URL up to ~250KB
  signatureData: z.string().min(1).max(400_000),
  agreed: z.literal(true),
});

const DownloadSchema = z.object({
  action: z.literal("download"),
  clientId: z.string().uuid(),
  contractId: z.string().uuid(),
});

const ActionSchema = z.discriminatedUnion("action", [GetSchema, SignSchema, DownloadSchema]);

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

    // Load client (all actions need the client record)
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, business_name, contact_name, tier, archived")
      .eq("id", input.clientId)
      .maybeSingle();
    if (clientErr) throw clientErr;
    if (!client || client.archived) {
      return new Response(JSON.stringify({ error: "Client not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const template = getContractTemplate(client.tier);

    if (input.action === "get") {
      const { data: existing } = await supabase
        .from("client_contracts")
        .select(
          "id, tier, template_version, client_signature_name, client_signature_type, client_signed_at, agency_signer_name, agency_countersigned_at, pdf_path",
        )
        .eq("client_id", input.clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let pdfUrl: string | null = null;
      if (existing?.pdf_path) {
        const { data: signed } = await supabase.storage
          .from("client-assets")
          .createSignedUrl(existing.pdf_path, 60 * 60);
        pdfUrl = signed?.signedUrl ?? null;
      }

      return new Response(
        JSON.stringify({
          template,
          contract: existing
            ? { ...existing, pdf_url: pdfUrl }
            : null,
          client: {
            id: client.id,
            business_name: client.business_name,
            contact_name: client.contact_name,
            tier: client.tier,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (input.action === "sign") {
      // Refuse to double-sign
      const { data: already } = await supabase
        .from("client_contracts")
        .select("id")
        .eq("client_id", input.clientId)
        .limit(1)
        .maybeSingle();
      if (already) {
        return new Response(
          JSON.stringify({ error: "Contract already signed for this client." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Drawn signatures must be PNG data URLs
      if (input.signatureType === "drawn" && !input.signatureData.startsWith("data:image/png")) {
        return new Response(
          JSON.stringify({ error: "Drawn signature must be a PNG data URL." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const ip = getClientIp(req);
      const ua = req.headers.get("user-agent");
      const now = new Date();

      // Insert contract row first (gets ID for pdf path)
      const { data: inserted, error: insertErr } = await supabase
        .from("client_contracts")
        .insert({
          client_id: input.clientId,
          tier: client.tier,
          template_version: template.version,
          client_signature_name: input.signatureName,
          client_signature_type: input.signatureType,
          client_signature_data: input.signatureData,
          client_signed_at: now.toISOString(),
          client_ip: ip,
          client_user_agent: ua,
          agency_countersigned_at: now.toISOString(),
        })
        .select("id, agency_signer_name")
        .single();
      if (insertErr) throw insertErr;

      // Render PDF
      let pdfPath: string | null = null;
      let pdfUrl: string | null = null;
      try {
        const pdfBytes = await renderContractPdf({
          template,
          businessName: client.business_name ?? "Client",
          clientName: client.contact_name ?? input.signatureName,
          clientSignature: {
            type: input.signatureType,
            data: input.signatureData,
            name: input.signatureName,
          },
          signedAt: now,
          agencyName: inserted.agency_signer_name,
          countersignedAt: now,
          ip,
        });

        pdfPath = `contracts/${input.clientId}/${inserted.id}.pdf`;
        const { error: upErr } = await supabase.storage
          .from("client-assets")
          .upload(pdfPath, pdfBytes, {
            cacheControl: "3600",
            upsert: true,
            contentType: "application/pdf",
          });
        if (upErr) throw upErr;

        const { data: signed } = await supabase.storage
          .from("client-assets")
          .createSignedUrl(pdfPath, 60 * 60);
        pdfUrl = signed?.signedUrl ?? null;

        await supabase
          .from("client_contracts")
          .update({
            pdf_path: pdfPath,
            pdf_url: pdfUrl,
            pdf_generated_at: now.toISOString(),
          })
          .eq("id", inserted.id);
      } catch (pdfErr) {
        console.error("[contract-sign] PDF generation failed:", pdfErr);
        // Don't fail the whole signing — the signature record stands; PDF can be regenerated.
      }

      // Flip checklist items
      try {
        await flipIntakeChecklist(supabase, input.clientId);
      } catch (e) {
        console.warn("[contract-sign] checklist flip failed:", e);
      }

      return new Response(
        JSON.stringify({
          success: true,
          contractId: inserted.id,
          pdfUrl,
          pdfPath,
          signedAt: now.toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (input.action === "download") {
      const { data: row } = await supabase
        .from("client_contracts")
        .select("id, pdf_path")
        .eq("id", input.contractId)
        .eq("client_id", input.clientId)
        .maybeSingle();
      if (!row?.pdf_path) {
        return new Response(JSON.stringify({ error: "No PDF available" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: signed, error: signErr } = await supabase.storage
        .from("client-assets")
        .createSignedUrl(row.pdf_path, 60 * 60);
      if (signErr) throw signErr;
      return new Response(JSON.stringify({ pdfUrl: signed?.signedUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[contract-sign] error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
