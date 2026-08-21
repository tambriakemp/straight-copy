// Rendering a structured proposal to PDF.
//
// The signing flow stamps a signature page onto a source PDF, so a proposal
// that exists only as structured content has nothing to sign. Rather than make
// the agent's proposals a second-class thing that can only be read, they get
// rendered here into the same kind of artifact an uploaded PDF is — which means
// draft, send, sign and countersign all work on one path.
//
// The Cre8 Visions palette and typographic hierarchy are reproduced with
// pdf-lib's standard fonts: Times for the Georgia display faces, Helvetica for
// the Arial body. Not identical to the docx template, deliberately close.
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { writtenSections, type ProposalContent } from "./agents/proposal-spine.ts";

const PAGE_W = 612;   // US Letter, 72dpi
const PAGE_H = 792;
const MARGIN = 72;
const CONTENT_W = PAGE_W - MARGIN * 2;

const INK = rgb(0x1a / 255, 0x19 / 255, 0x16 / 255);
const CHARCOAL = rgb(0x2a / 255, 0x28 / 255, 0x25 / 255);
const BRONZE = rgb(0x8b / 255, 0x73 / 255, 0x55 / 255);
const TAUPE = rgb(0xa8 / 255, 0x9f / 255, 0x94 / 255);
const SAND = rgb(0xd4 / 255, 0xcc / 255, 0xbf / 255);
const CREAM = rgb(0xf5 / 255, 0xf2 / 255, 0xee / 255);
const SOFT_GRAY = rgb(0x9a / 255, 0x93 / 255, 0x8a / 255);

interface Fonts {
  body: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  bodyBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  display: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  displayItalic: Awaited<ReturnType<PDFDocument["embedFont"]>>;
}

/** Greedy wrap. Returns the lines that fit CONTENT_W (or a narrower width). */
function wrap(
  text: string,
  font: Fonts["body"],
  size: number,
  width = CONTENT_W,
): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(""); continue; }
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= width) {
        line = next;
      } else {
        if (line) out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Strips the inline markdown the renderer doesn't draw. */
const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");

class Cursor {
  doc: PDFDocument;
  fonts: Fonts;
  page: ReturnType<PDFDocument["addPage"]>;
  y: number;
  projectName: string;
  pages: Array<ReturnType<PDFDocument["addPage"]>> = [];

  constructor(doc: PDFDocument, fonts: Fonts, projectName: string) {
    this.doc = doc;
    this.fonts = fonts;
    this.projectName = projectName;
    this.page = this.newPage();
    this.y = PAGE_H - MARGIN;
  }

  newPage() {
    const p = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(p);
    return p;
  }

  /** Start a fresh page. Sections always begin on one. */
  break() {
    this.page = this.newPage();
    this.y = PAGE_H - MARGIN;
  }

  /** Ensure `needed` points of vertical room, breaking if not. */
  room(needed: number) {
    if (this.y - needed < MARGIN + 40) this.break();
  }

  text(
    s: string,
    opts: { font: Fonts["body"]; size: number; color: typeof INK; lead?: number; indent?: number; width?: number },
  ) {
    const lead = opts.lead ?? opts.size * 1.5;
    const x = MARGIN + (opts.indent ?? 0);
    for (const line of wrap(s, opts.font, opts.size, opts.width ?? CONTENT_W - (opts.indent ?? 0))) {
      this.room(lead);
      if (line) {
        this.page.drawText(line, { x, y: this.y - opts.size, size: opts.size, font: opts.font, color: opts.color });
      }
      this.y -= lead;
    }
  }

  gap(n: number) { this.y -= n; }

  rule(color = SAND) {
    this.room(12);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.75,
      color,
    });
    this.y -= 14;
  }
}

/** Draw the section body, honouring the four constructs the brief allows. */
function drawBody(c: Cursor, md: string) {
  const lines = md.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();

    if (!line.trim()) { c.gap(6); i++; continue; }

    if (line.startsWith("## ")) {
      c.gap(12);
      c.room(28);
      c.text(plain(line.slice(3)).toUpperCase(), {
        font: c.fonts.bodyBold, size: 9, color: INK, lead: 15,
      });
      c.gap(4);
      i++;
      continue;
    }

    if (line.startsWith(">")) {
      // Collect the whole quote block, then draw it in a cream panel.
      const quote: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        quote.push(plain(lines[i].replace(/^\s*>\s?/, "")));
        i++;
      }
      const body = quote.join(" ");
      const wrapped = wrap(body, c.fonts.displayItalic, 12, CONTENT_W - 44);
      const height = wrapped.length * 18 + 24;
      c.room(height + 16);
      c.gap(8);
      c.page.drawRectangle({
        x: MARGIN, y: c.y - height, width: CONTENT_W, height, color: CREAM,
      });
      c.page.drawRectangle({
        x: MARGIN, y: c.y - height, width: 3, height, color: BRONZE,
      });
      let qy = c.y - 18;
      for (const l of wrapped) {
        c.page.drawText(l, { x: MARGIN + 20, y: qy, size: 12, font: c.fonts.displayItalic, color: INK });
        qy -= 18;
      }
      c.y -= height + 12;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const item = plain(line.replace(/^[-*]\s+/, ""));
      c.room(16);
      c.page.drawText("—", { x: MARGIN, y: c.y - 10, size: 10, font: c.fonts.body, color: BRONZE });
      c.text(item, { font: c.fonts.body, size: 10, color: CHARCOAL, lead: 15, indent: 18 });
      c.gap(2);
      i++;
      continue;
    }

    // A run of plain lines is one paragraph.
    const para: string[] = [];
    while (
      i < lines.length && lines[i].trim() &&
      !lines[i].startsWith("## ") && !lines[i].trimStart().startsWith(">") &&
      !/^[-*]\s+/.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i++;
    }
    c.text(plain(para.join(" ")), { font: c.fonts.body, size: 10, color: CHARCOAL, lead: 15 });
    c.gap(8);
  }
}

export async function renderProposalPdf(
  title: string,
  content: ProposalContent,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    body: await doc.embedFont(StandardFonts.Helvetica),
    bodyBold: await doc.embedFont(StandardFonts.HelveticaBold),
    display: await doc.embedFont(StandardFonts.TimesRoman),
    displayItalic: await doc.embedFont(StandardFonts.TimesRomanItalic),
  };

  const cover = content.cover ?? {};
  const projectName = cover.project_name || title;
  const c = new Cursor(doc, fonts, projectName);

  // --- cover ---
  c.y = PAGE_H - 200;
  c.text("CRE8 VISIONS · PROPOSAL · CONFIDENTIAL", {
    font: fonts.bodyBold, size: 8, color: BRONZE, lead: 24,
  });
  c.text(projectName, { font: fonts.display, size: 32, color: INK, lead: 38 });
  if (cover.tagline) {
    c.gap(6);
    c.text(cover.tagline, { font: fonts.displayItalic, size: 13, color: TAUPE, lead: 19 });
  }
  c.gap(28);
  c.rule();
  if (cover.prepared_for) {
    c.text(`Prepared for   ${cover.prepared_for}`, { font: fonts.body, size: 10, color: CHARCOAL, lead: 16 });
  }
  if (cover.prepared_by) {
    c.text(`Prepared by   ${cover.prepared_by}`, { font: fonts.body, size: 10, color: CHARCOAL, lead: 16 });
  }
  if (cover.date) {
    c.text(cover.date, { font: fonts.body, size: 10, color: SOFT_GRAY, lead: 16 });
  }

  // --- contents ---
  c.break();
  c.text("CONTENTS", { font: fonts.bodyBold, size: 8, color: BRONZE, lead: 20 });
  c.text("What's in this proposal", { font: fonts.display, size: 24, color: INK, lead: 30 });
  c.rule();
  const sections = writtenSections(content).map((s) => ({
    heading: (s.heading ?? "").trim() || "Untitled section",
    purpose: (s.summary ?? "").trim(),
    body: (s.body ?? "").trim(),
  }));

  sections.forEach((s, idx) => {
    c.room(30);
    const n = String(idx + 1).padStart(2, "0");
    c.page.drawText(n, { x: MARGIN, y: c.y - 11, size: 9, font: fonts.bodyBold, color: BRONZE });
    c.page.drawText(s.heading, { x: MARGIN + 30, y: c.y - 11, size: 12, font: fonts.display, color: INK });
    c.y -= 16;
    if (s.purpose) {
      c.text(s.purpose, { font: fonts.body, size: 8.5, color: TAUPE, lead: 12, indent: 30 });
    }
    c.gap(6);
  });

  // --- the sections, in the order the agent wrote them ---
  sections.forEach((s, idx) => {
    c.break();
    c.text(`${String(idx + 1).padStart(2, "0")} — ${s.heading.toUpperCase()}`, {
      font: fonts.bodyBold, size: 8, color: BRONZE, lead: 18,
    });
    c.text(s.heading, { font: fonts.display, size: 24, color: INK, lead: 30 });
    c.rule();
    drawBody(c, s.body);
  });

  // --- running header and footer, once the page count is known ---
  const total = c.pages.length;
  c.pages.forEach((page, i) => {
    if (i > 0) {
      page.drawText(`CRE8 VISIONS · ${projectName.toUpperCase()} PROPOSAL · CONFIDENTIAL`.slice(0, 90), {
        x: MARGIN, y: PAGE_H - 40, size: 7, font: fonts.bodyBold, color: BRONZE,
      });
    }
    page.drawLine({
      start: { x: MARGIN, y: 52 }, end: { x: PAGE_W - MARGIN, y: 52 },
      thickness: 0.5, color: SAND,
    });
    page.drawText("cre8visions.com · AI Business Architecture", {
      x: MARGIN, y: 38, size: 7, font: fonts.body, color: SOFT_GRAY,
    });
    const label = `Page ${i + 1} of ${total}`;
    page.drawText(label, {
      x: PAGE_W - MARGIN - fonts.body.widthOfTextAtSize(label, 7),
      y: 38, size: 7, font: fonts.body, color: SOFT_GRAY,
    });
  });

  return await doc.save();
}
