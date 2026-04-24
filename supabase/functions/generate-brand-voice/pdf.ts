// Editorial-styled PDF renderer for the brand voice document.
// Embeds Cormorant Garamond + Karla. Cream/ink/bronze palette to match the brand.
import { PDFDocument, PDFFont, PDFPage, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";

// Color palette (matches mem://style/aesthetic)
const CREAM = rgb(0.9608, 0.9451, 0.9176);   // #F5F1EA
const INK = rgb(0.1020, 0.0980, 0.0863);     // #1A1916
const TAUPE = rgb(0.5451, 0.4941, 0.4314);   // #8B7E6E
const BRONZE = rgb(0.6431, 0.4431, 0.2824);  // #A47148
const RULE = rgb(0.6431, 0.4431, 0.2824);

// Font URLs (Google Fonts static TTF mirrors — pinned).
// Note: Lora is used in place of Cormorant/Garamond because pdf-lib's TTF
// subsetting drops glyphs from fonts with aggressive GSUB ligatures (Cormorant,
// EB Garamond). Lora keeps an editorial serif feel and renders cleanly.
const FONTS = {
  serifRegular: "https://fonts.gstatic.com/s/lora/v37/0QI6MX1D_JOuGQbT0gvTJPa787weuyJG.ttf",
  serifSemi: "https://fonts.gstatic.com/s/lora/v37/0QI6MX1D_JOuGQbT0gvTJPa787zAvCJG.ttf",
  serifItalic: "https://fonts.gstatic.com/s/lora/v37/0QI8MX1D_JOuMw_hLdO6T2wV9KnW-MoFkqg.ttf",
  karlaRegular: "https://fonts.gstatic.com/s/karla/v33/qkBIXvYC6trAT55ZBi1ueQVIjQTD-JqqFA.ttf",
  karlaMedium: "https://fonts.gstatic.com/s/karla/v33/qkBIXvYC6trAT55ZBi1ueQVIjQTDypqqFA.ttf",
};

let cachedFonts: { [k: string]: Uint8Array } | null = null;
async function loadFonts() {
  if (cachedFonts) return cachedFonts;
  const entries = await Promise.all(
    Object.entries(FONTS).map(async ([k, url]) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Failed to fetch ${k}: ${r.status}`);
      return [k, new Uint8Array(await r.arrayBuffer())] as const;
    })
  );
  cachedFonts = Object.fromEntries(entries);
  return cachedFonts;
}

interface Fonts {
  serifLight: PDFFont;
  serifSemi: PDFFont;
  serifItalic: PDFFont;
  body: PDFFont;
  bodyMedium: PDFFont;
}

// Page geometry — US Letter
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 72;
const MARGIN_TOP = 96;
const MARGIN_BOT = 96;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

interface Cursor {
  page: PDFPage;
  y: number;
  pageNum: number;
}

function newPage(doc: PDFDocument): PDFPage {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: CREAM });
  return page;
}

function drawFooter(page: PDFPage, fonts: Fonts, businessName: string, pageNum: number) {
  // bronze hairline
  page.drawRectangle({
    x: MARGIN_X,
    y: MARGIN_BOT - 32,
    width: CONTENT_W,
    height: 0.5,
    color: RULE,
    opacity: 0.5,
  });
  const left = `Cre8 Visions  ·  Brand Voice  ·  ${businessName}`;
  page.drawText(left, {
    x: MARGIN_X,
    y: MARGIN_BOT - 50,
    size: 8,
    font: fonts.body,
    color: TAUPE,
  });
  const right = String(pageNum).padStart(2, "0");
  const rw = fonts.body.widthOfTextAtSize(right, 8);
  page.drawText(right, {
    x: PAGE_W - MARGIN_X - rw,
    y: MARGIN_BOT - 50,
    size: 8,
    font: fonts.body,
    color: TAUPE,
  });
}

function ensureSpace(doc: PDFDocument, c: Cursor, fonts: Fonts, businessName: string, needed: number) {
  if (c.y - needed < MARGIN_BOT) {
    drawFooter(c.page, fonts, businessName, c.pageNum);
    c.page = newPage(doc);
    c.pageNum += 1;
    c.y = PAGE_H - MARGIN_TOP;
  }
}

// Word-wrap a single inline text run.
function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      // word longer than maxWidth: hard break
      if (font.widthOfTextAtSize(w, size) > maxWidth) {
        let chunk = "";
        for (const ch of w) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
            lines.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        cur = chunk;
      } else cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Render a paragraph that may contain **bold** spans, with word-wrap.
function drawParagraph(
  doc: PDFDocument,
  c: Cursor,
  fonts: Fonts,
  businessName: string,
  text: string,
  opts: { size?: number; lineHeight?: number; indent?: number; color?: ReturnType<typeof rgb> } = {}
) {
  const size = opts.size ?? 10.5;
  const lh = opts.lineHeight ?? size * 1.55;
  const indent = opts.indent ?? 0;
  const color = opts.color ?? INK;
  const maxW = CONTENT_W - indent;

  // Tokenize bold markers
  const segments: { text: string; bold: boolean }[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const p of parts) {
    if (!p) continue;
    if (p.startsWith("**") && p.endsWith("**")) {
      segments.push({ text: p.slice(2, -2), bold: true });
    } else {
      segments.push({ text: p, bold: false });
    }
  }

  // Word-level layout across mixed bold/regular runs
  type Word = { text: string; font: PDFFont; w: number };
  const words: Word[] = [];
  for (const seg of segments) {
    const f = seg.bold ? fonts.bodyMedium : fonts.body;
    for (const w of seg.text.split(/(\s+)/)) {
      if (!w) continue;
      words.push({ text: w, font: f, w: f.widthOfTextAtSize(w, size) });
    }
  }

  let line: Word[] = [];
  let lineW = 0;
  const flushLine = (last: boolean) => {
    ensureSpace(doc, c, fonts, businessName, lh);
    let x = MARGIN_X + indent;
    for (const w of line) {
      if (w.text.trim() === "" && line[0] === w) continue;
      c.page.drawText(w.text, { x, y: c.y - size, size, font: w.font, color });
      x += w.w;
    }
    c.y -= lh;
    line = [];
    lineW = 0;
    if (last) c.y -= 0;
  };

  for (const w of words) {
    if (w.text === "\n") { flushLine(false); continue; }
    if (lineW + w.w > maxW && line.length > 0) flushLine(false);
    line.push(w);
    lineW += w.w;
  }
  if (line.length) flushLine(true);
}

function drawHairline(c: Cursor, width = 48, color = RULE) {
  c.page.drawRectangle({ x: MARGIN_X, y: c.y, width, height: 0.75, color });
  c.y -= 18;
}

// --------- Cover ----------
function drawCover(page: PDFPage, fonts: Fonts, businessName: string, dateStr: string) {
  // tiny wordmark
  const wm = "CRE8  ·  VISIONS";
  page.drawText(wm, {
    x: MARGIN_X,
    y: PAGE_H - MARGIN_TOP,
    size: 9,
    font: fonts.bodyMedium,
    color: BRONZE,
  });

  // accent rule
  page.drawRectangle({
    x: MARGIN_X,
    y: PAGE_H / 2 + 80,
    width: 56,
    height: 1,
    color: BRONZE,
  });

  // big title
  const title = "Brand";
  const title2 = "Voice.";
  page.drawText(title, {
    x: MARGIN_X,
    y: PAGE_H / 2 + 10,
    size: 84,
    font: fonts.serifLight,
    color: INK,
  });
  page.drawText(title2, {
    x: MARGIN_X,
    y: PAGE_H / 2 - 70,
    size: 84,
    font: fonts.serifItalic,
    color: BRONZE,
  });

  // business name
  page.drawText(businessName, {
    x: MARGIN_X,
    y: MARGIN_BOT + 80,
    size: 22,
    font: fonts.serifItalic,
    color: INK,
  });

  // date / meta
  page.drawText(`Generated  ${dateStr}`, {
    x: MARGIN_X,
    y: MARGIN_BOT + 50,
    size: 9,
    font: fonts.body,
    color: TAUPE,
  });
  page.drawText("CONFIDENTIAL  ·  CLIENT REFERENCE DOCUMENT", {
    x: MARGIN_X,
    y: MARGIN_BOT + 30,
    size: 8,
    font: fonts.bodyMedium,
    color: TAUPE,
  });
}

// --------- Markdown parsing ----------
type Block =
  | { kind: "h2"; text: string; num?: string }
  | { kind: "h3"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "para"; text: string }
  | { kind: "qrc"; text: string };

function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let buf: string[] = [];
  const flushPara = () => {
    if (buf.length) {
      const text = buf.join(" ").replace(/\s+/g, " ").trim();
      if (text) blocks.push({ kind: "para", text });
      buf = [];
    }
  };

  let inQrc = false;
  let qrcBuf: string[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("--- QUICK REFERENCE CARD")) {
      flushPara();
      inQrc = true;
      qrcBuf = [];
      continue;
    }
    if (line.startsWith("--- END QUICK REFERENCE CARD")) {
      const text = qrcBuf.join(" ").replace(/\s+/g, " ").trim();
      if (text) blocks.push({ kind: "qrc", text });
      inQrc = false;
      continue;
    }
    if (inQrc) {
      if (line.trim()) qrcBuf.push(line.trim());
      continue;
    }

    if (!line.trim()) { flushPara(); continue; }

    const h2 = line.match(/^##\s+(?:(\d+)\.\s+)?(.+)$/);
    if (h2) {
      flushPara();
      blocks.push({ kind: "h2", num: h2[1], text: h2[2].trim() });
      continue;
    }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      flushPara();
      blocks.push({ kind: "h3", text: h3[1].trim() });
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushPara();
      blocks.push({ kind: "bullet", text: bullet[1].trim() });
      continue;
    }
    const numbered = line.match(/^\d+\.\s+(.+)$/);
    if (numbered) {
      flushPara();
      blocks.push({ kind: "bullet", text: numbered[1].trim() });
      continue;
    }
    buf.push(line.trim());
  }
  flushPara();
  return blocks;
}

// --------- QRC callout ----------
function drawQrcCallout(doc: PDFDocument, c: Cursor, fonts: Fonts, businessName: string, text: string) {
  // Always start QRC on its own page for visual punch
  drawFooter(c.page, fonts, businessName, c.pageNum);
  c.page = newPage(doc);
  c.pageNum += 1;
  c.y = PAGE_H - MARGIN_TOP;

  // Eyebrow
  c.page.drawText("QUICK REFERENCE CARD", {
    x: MARGIN_X, y: c.y, size: 9, font: fonts.bodyMedium, color: BRONZE,
  });
  c.y -= 14;
  c.page.drawText("Copy this paragraph into Claude Project as a system prompt.", {
    x: MARGIN_X, y: c.y, size: 9, font: fonts.serifItalic, color: TAUPE,
  });
  c.y -= 36;

  // Ink callout box
  const padding = 28;
  const innerW = CONTENT_W - padding * 2;
  // Pre-measure height
  const lines = wrapLine(text, fonts.serifLight, 13, innerW);
  const lineH = 13 * 1.7;
  const boxH = padding * 2 + lines.length * lineH;
  const boxTop = c.y;
  const boxBottom = boxTop - boxH;

  if (boxBottom < MARGIN_BOT + 20) {
    // shouldn't happen on a fresh page, but guard
    drawFooter(c.page, fonts, businessName, c.pageNum);
    c.page = newPage(doc);
    c.pageNum += 1;
    c.y = PAGE_H - MARGIN_TOP;
  }

  c.page.drawRectangle({
    x: MARGIN_X, y: boxBottom, width: CONTENT_W, height: boxH, color: INK,
  });
  // bronze corner accent
  c.page.drawRectangle({
    x: MARGIN_X, y: boxTop - 4, width: 56, height: 2, color: BRONZE,
  });

  let ty = boxTop - padding - 13;
  for (const ln of lines) {
    c.page.drawText(ln, {
      x: MARGIN_X + padding, y: ty, size: 13, font: fonts.serifLight, color: CREAM,
    });
    ty -= lineH;
  }

  c.y = boxBottom - 24;
}

// --------- Main render ----------
export async function renderBrandVoicePdf(
  brandVoiceDoc: string,
  businessName: string,
  generatedAt: Date,
): Promise<Uint8Array> {
  const ff = await loadFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const fonts: Fonts = {
    serifLight: await doc.embedFont(ff.cormorantLight, { subset: true }),
    serifSemi: await doc.embedFont(ff.cormorantSemi, { subset: true }),
    serifItalic: await doc.embedFont(ff.cormorantItalic, { subset: true }),
    body: await doc.embedFont(ff.karlaRegular, { subset: true }),
    bodyMedium: await doc.embedFont(ff.karlaMedium, { subset: true }),
  };

  const dateStr = generatedAt.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const safeBusiness = businessName?.trim() || "Untitled Brand";

  // Cover (no footer)
  const cover = newPage(doc);
  drawCover(cover, fonts, safeBusiness, dateStr);

  // Body pages
  const c: Cursor = { page: newPage(doc), y: PAGE_H - MARGIN_TOP, pageNum: 2 };

  // Section header rendered when h2 hit
  const blocks = parseBlocks(brandVoiceDoc);
  let sectionCount = 0;

  for (const b of blocks) {
    if (b.kind === "qrc") {
      drawQrcCallout(doc, c, fonts, safeBusiness, b.text);
      continue;
    }
    if (b.kind === "h2") {
      sectionCount += 1;
      // start each section near top of fresh page after the first
      if (sectionCount > 1) {
        drawFooter(c.page, fonts, safeBusiness, c.pageNum);
        c.page = newPage(doc);
        c.pageNum += 1;
        c.y = PAGE_H - MARGIN_TOP;
      }
      const num = (b.num || String(sectionCount)).padStart(2, "0");
      // Section number eyebrow
      c.page.drawText(`SECTION ${num}`, {
        x: MARGIN_X, y: c.y, size: 9, font: fonts.bodyMedium, color: BRONZE,
      });
      c.y -= 26;
      // Title
      const titleLines = wrapLine(b.text, fonts.serifLight, 32, CONTENT_W);
      for (const ln of titleLines) {
        c.page.drawText(ln, {
          x: MARGIN_X, y: c.y - 32, size: 32, font: fonts.serifLight, color: INK,
        });
        c.y -= 38;
      }
      c.y -= 8;
      drawHairline(c);
      continue;
    }
    if (b.kind === "h3") {
      ensureSpace(doc, c, fonts, safeBusiness, 36);
      c.y -= 8;
      const lines = wrapLine(b.text, fonts.serifSemi, 14, CONTENT_W);
      for (const ln of lines) {
        c.page.drawText(ln, {
          x: MARGIN_X, y: c.y - 14, size: 14, font: fonts.serifSemi, color: INK,
        });
        c.y -= 18;
      }
      c.y -= 6;
      continue;
    }
    if (b.kind === "bullet") {
      ensureSpace(doc, c, fonts, safeBusiness, 18);
      // bronze diamond bullet
      c.page.drawRectangle({
        x: MARGIN_X + 4, y: c.y - 8, width: 4, height: 4,
        color: BRONZE, rotate: { type: "degrees", angle: 45 } as never,
      });
      drawParagraph(doc, c, fonts, safeBusiness, b.text, { indent: 22, size: 10.5 });
      c.y -= 4;
      continue;
    }
    if (b.kind === "para") {
      drawParagraph(doc, c, fonts, safeBusiness, b.text, { size: 10.5 });
      c.y -= 8;
      continue;
    }
  }

  // Footer for last page
  drawFooter(c.page, fonts, safeBusiness, c.pageNum);

  return await doc.save();
}
