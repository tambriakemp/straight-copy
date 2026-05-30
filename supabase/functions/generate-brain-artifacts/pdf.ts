// Editorial-styled PDF renderer for brain artifact documents. Mirrors the
// styling of generate-brand-voice/pdf.ts but accepts a configurable cover
// title and subtitle so each artifact gets its own cover.
import { PDFDocument, PDFFont, PDFPage, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";

const CREAM = rgb(0.9608, 0.9451, 0.9176);
const INK = rgb(0.1020, 0.0980, 0.0863);
const TAUPE = rgb(0.5451, 0.4941, 0.4314);
const BRONZE = rgb(0.6431, 0.4431, 0.2824);
const RULE = rgb(0.6431, 0.4431, 0.2824);

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
    }),
  );
  cachedFonts = Object.fromEntries(entries);
  return cachedFonts;
}

interface Fonts {
  serifLight: PDFFont; serifSemi: PDFFont; serifItalic: PDFFont;
  body: PDFFont; bodyMedium: PDFFont;
}

const PAGE_W = 612, PAGE_H = 792, MARGIN_X = 72, MARGIN_TOP = 96, MARGIN_BOT = 96;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

interface Cursor { page: PDFPage; y: number; pageNum: number }

function newPage(doc: PDFDocument): PDFPage {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: CREAM });
  return page;
}

function drawFooter(page: PDFPage, fonts: Fonts, businessName: string, docLabel: string, pageNum: number) {
  page.drawRectangle({ x: MARGIN_X, y: MARGIN_BOT - 32, width: CONTENT_W, height: 0.5, color: RULE, opacity: 0.5 });
  const left = `Cre8 Visions  ·  ${docLabel}  ·  ${businessName}`;
  page.drawText(left, { x: MARGIN_X, y: MARGIN_BOT - 50, size: 8, font: fonts.body, color: TAUPE });
  const right = String(pageNum).padStart(2, "0");
  const rw = fonts.body.widthOfTextAtSize(right, 8);
  page.drawText(right, { x: PAGE_W - MARGIN_X - rw, y: MARGIN_BOT - 50, size: 8, font: fonts.body, color: TAUPE });
}

function ensureSpace(doc: PDFDocument, c: Cursor, fonts: Fonts, businessName: string, docLabel: string, needed: number) {
  if (c.y - needed < MARGIN_BOT) {
    drawFooter(c.page, fonts, businessName, docLabel, c.pageNum);
    c.page = newPage(doc); c.pageNum += 1; c.y = PAGE_H - MARGIN_TOP;
  }
}

function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = []; let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) { cur = test; }
    else {
      if (cur) lines.push(cur);
      if (font.widthOfTextAtSize(w, size) > maxWidth) {
        let chunk = "";
        for (const ch of w) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) { lines.push(chunk); chunk = ch; }
          else chunk += ch;
        }
        cur = chunk;
      } else cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawParagraph(
  doc: PDFDocument, c: Cursor, fonts: Fonts, businessName: string, docLabel: string,
  text: string,
  opts: { size?: number; lineHeight?: number; indent?: number; color?: ReturnType<typeof rgb> } = {},
) {
  const size = opts.size ?? 10.5;
  const lh = opts.lineHeight ?? size * 1.55;
  const indent = opts.indent ?? 0;
  const color = opts.color ?? INK;
  const maxW = CONTENT_W - indent;

  const segments: { text: string; bold: boolean }[] = [];
  for (const p of text.split(/(\*\*[^*]+\*\*)/g)) {
    if (!p) continue;
    if (p.startsWith("**") && p.endsWith("**")) segments.push({ text: p.slice(2, -2), bold: true });
    else segments.push({ text: p, bold: false });
  }
  type Word = { text: string; font: PDFFont; w: number };
  const words: Word[] = [];
  for (const seg of segments) {
    const f = seg.bold ? fonts.bodyMedium : fonts.body;
    for (const w of seg.text.split(/(\s+)/)) {
      if (!w) continue;
      words.push({ text: w, font: f, w: f.widthOfTextAtSize(w, size) });
    }
  }
  let line: Word[] = []; let lineW = 0;
  const flushLine = () => {
    ensureSpace(doc, c, fonts, businessName, docLabel, lh);
    let x = MARGIN_X + indent;
    for (const w of line) {
      if (w.text.trim() === "" && line[0] === w) continue;
      c.page.drawText(w.text, { x, y: c.y - size, size, font: w.font, color });
      x += w.w;
    }
    c.y -= lh; line = []; lineW = 0;
  };
  for (const w of words) {
    if (lineW + w.w > maxW && line.length > 0) flushLine();
    line.push(w); lineW += w.w;
  }
  if (line.length) flushLine();
}

function drawHairline(c: Cursor) {
  c.page.drawRectangle({ x: MARGIN_X, y: c.y, width: 48, height: 0.75, color: RULE });
  c.y -= 18;
}

function drawCover(
  page: PDFPage, fonts: Fonts, businessName: string,
  title: string, subtitle: string, dateStr: string,
) {
  page.drawText("CRE8  ·  VISIONS", { x: MARGIN_X, y: PAGE_H - MARGIN_TOP, size: 9, font: fonts.bodyMedium, color: BRONZE });
  page.drawRectangle({ x: MARGIN_X, y: PAGE_H / 2 + 80, width: 56, height: 1, color: BRONZE });
  page.drawText(title, { x: MARGIN_X, y: PAGE_H / 2 + 10, size: 72, font: fonts.serifLight, color: INK });
  page.drawText(subtitle, { x: MARGIN_X, y: PAGE_H / 2 - 70, size: 72, font: fonts.serifItalic, color: BRONZE });
  page.drawText(businessName, { x: MARGIN_X, y: MARGIN_BOT + 80, size: 22, font: fonts.serifItalic, color: INK });
  page.drawText(`Generated  ${dateStr}`, { x: MARGIN_X, y: MARGIN_BOT + 50, size: 9, font: fonts.body, color: TAUPE });
  page.drawText("CONFIDENTIAL  ·  AI BUSINESS BRAIN ARTIFACT", { x: MARGIN_X, y: MARGIN_BOT + 30, size: 8, font: fonts.bodyMedium, color: TAUPE });
}

type Block =
  | { kind: "h2"; text: string; num?: string }
  | { kind: "h3"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "para"; text: string };

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
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); continue; }
    const h2 = line.match(/^##\s+(?:(\d+)\.\s+)?(.+)$/);
    if (h2) { flushPara(); blocks.push({ kind: "h2", num: h2[1], text: h2[2].trim() }); continue; }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) { flushPara(); blocks.push({ kind: "h3", text: h3[1].trim() }); continue; }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) { flushPara(); blocks.push({ kind: "bullet", text: bullet[1].trim() }); continue; }
    const num = line.match(/^\d+\.\s+(.+)$/);
    if (num) { flushPara(); blocks.push({ kind: "bullet", text: num[1].trim() }); continue; }
    buf.push(line.trim());
  }
  flushPara();
  return blocks;
}

export async function renderArtifactPdf(
  markdown: string,
  businessName: string,
  title: string,
  subtitle: string,
  generatedAt: Date,
): Promise<Uint8Array> {
  const ff = await loadFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fonts: Fonts = {
    serifLight: await doc.embedFont(ff.serifRegular, { subset: true }),
    serifSemi: await doc.embedFont(ff.serifSemi, { subset: true }),
    serifItalic: await doc.embedFont(ff.serifItalic, { subset: true }),
    body: await doc.embedFont(ff.karlaRegular, { subset: true }),
    bodyMedium: await doc.embedFont(ff.karlaMedium, { subset: true }),
  };
  const dateStr = generatedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const safeBusiness = businessName?.trim() || "Untitled Brand";
  const docLabel = `${title.trim()} ${subtitle.trim()}`.replace(/\.$/, "").trim();

  const cover = newPage(doc);
  drawCover(cover, fonts, safeBusiness, title, subtitle, dateStr);

  const c: Cursor = { page: newPage(doc), y: PAGE_H - MARGIN_TOP, pageNum: 2 };
  const blocks = parseBlocks(markdown);
  let sectionCount = 0;

  for (const b of blocks) {
    if (b.kind === "h2") {
      sectionCount += 1;
      if (sectionCount > 1) {
        drawFooter(c.page, fonts, safeBusiness, docLabel, c.pageNum);
        c.page = newPage(doc); c.pageNum += 1; c.y = PAGE_H - MARGIN_TOP;
      }
      const num = (b.num || String(sectionCount)).padStart(2, "0");
      c.page.drawText(`SECTION ${num}`, { x: MARGIN_X, y: c.y, size: 9, font: fonts.bodyMedium, color: BRONZE });
      c.y -= 26;
      for (const ln of wrapLine(b.text, fonts.serifLight, 28, CONTENT_W)) {
        c.page.drawText(ln, { x: MARGIN_X, y: c.y - 28, size: 28, font: fonts.serifLight, color: INK });
        c.y -= 34;
      }
      c.y -= 8;
      drawHairline(c);
      continue;
    }
    if (b.kind === "h3") {
      ensureSpace(doc, c, fonts, safeBusiness, docLabel, 36);
      c.y -= 8;
      for (const ln of wrapLine(b.text, fonts.serifSemi, 14, CONTENT_W)) {
        c.page.drawText(ln, { x: MARGIN_X, y: c.y - 14, size: 14, font: fonts.serifSemi, color: INK });
        c.y -= 18;
      }
      c.y -= 6;
      continue;
    }
    if (b.kind === "bullet") {
      ensureSpace(doc, c, fonts, safeBusiness, docLabel, 18);
      c.page.drawRectangle({
        x: MARGIN_X + 4, y: c.y - 8, width: 4, height: 4, color: BRONZE,
        rotate: { type: "degrees", angle: 45 } as never,
      });
      drawParagraph(doc, c, fonts, safeBusiness, docLabel, b.text, { indent: 22, size: 10.5 });
      c.y -= 4;
      continue;
    }
    if (b.kind === "para") {
      drawParagraph(doc, c, fonts, safeBusiness, docLabel, b.text, { size: 10.5 });
      c.y -= 8;
      continue;
    }
  }
  drawFooter(c.page, fonts, safeBusiness, docLabel, c.pageNum);
  return await doc.save();
}
