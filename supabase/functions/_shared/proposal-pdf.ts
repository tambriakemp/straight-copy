// Rendering a structured proposal to PDF.
//
// The signing flow stamps a signature page onto a source PDF, so a proposal
// that exists only as structured content has nothing to sign. Rather than make
// the agent's proposals a second-class thing that can only be read, they get
// rendered here into the same kind of artifact an uploaded PDF is — which means
// draft, send, sign and countersign all work on one path.
//
// The Cre8 Visions palette and typographic hierarchy: Gelasio for the Georgia
// display faces, embedded, and Helvetica for the Arial body, which is standard
// and needs no embedding because Helvetica is what Arial was drawn to match.
// The reasoning and the licensing position are in ./fonts/gelasio.ts.
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import { gelasioItalic, gelasioRegular } from "./fonts/gelasio.ts";
import {
  liftThesis,
  parseTable,
  stripSectionNumber,
  writtenSections,
  type ProposalContent,
  type ProposalTable,
} from "./agents/proposal-spine.ts";

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
const MIST = rgb(0xe8 / 255, 0xe4 / 255, 0xdf / 255);

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

/**
 * `| **Total** | **Monthly** | **$3,200** |` — the one row in an investment
 * table that must not look like every other row. `plain()` strips the asterisks
 * for drawing, so without this the total is set in the same weight as the line
 * items and the eye has nothing to land on. The HTML renderer gets this free
 * from `<strong>`.
 */
const WHOLLY_BOLD = /^\*\*(.+?)\*\*$/;
const isBoldCell = (s: string) => WHOLLY_BOLD.test(s.trim());

const TABLE_HEAD_SIZE = 7.5;
const TABLE_CELL_SIZE = 9;
const TABLE_PAD = 10;      // gutter between columns
const TABLE_LEAD = 13;

/**
 * Column widths: every column gets at least its widest single word, then the
 * rest of the line is shared out in proportion to how much more each column
 * wanted. Scaling naive proportions alone squeezes a money column below the
 * width of "$12,000" and wraps it mid-number, which looks like a typo in a
 * price list.
 */
function columnWidths(c: Cursor, t: ProposalTable): number[] {
  const min: number[] = [];
  const nat: number[] = [];

  for (let col = 0; col < t.head.length; col++) {
    const raw = [t.head[col] ?? "", ...t.rows.map((r) => r[col] ?? "")];
    const cells = raw.map((v, idx) => (idx === 0 ? plain(v).toUpperCase() : plain(v)));
    let mn = 0;
    let nt = 0;
    cells.forEach((text, idx) => {
      const bold = idx === 0 || isBoldCell(raw[idx]);
      const font = bold ? c.fonts.bodyBold : c.fonts.body;
      const size = idx === 0 ? TABLE_HEAD_SIZE : TABLE_CELL_SIZE;
      nt = Math.max(nt, font.widthOfTextAtSize(text, size));
      for (const word of text.split(/\s+/).filter(Boolean)) {
        mn = Math.max(mn, font.widthOfTextAtSize(word, size));
      }
    });
    min.push(mn + TABLE_PAD);
    nat.push(nt + TABLE_PAD);
  }

  const natTotal = nat.reduce((a, b) => a + b, 0);
  if (natTotal <= 0) return nat;
  if (natTotal <= CONTENT_W) {
    const slack = CONTENT_W - natTotal;
    return nat.map((w) => w + slack * (w / natTotal));
  }

  const minTotal = min.reduce((a, b) => a + b, 0);
  // Pathological — one unbreakable word wider than the page. Scale and let it clip.
  if (minTotal >= CONTENT_W) return min.map((w) => w * (CONTENT_W / minTotal));

  const want = nat.map((w, i) => w - min[i]);
  const wantTotal = want.reduce((a, b) => a + b, 0);
  const spare = CONTENT_W - minTotal;
  return min.map((w, i) => w + (wantTotal ? spare * (want[i] / wantTotal) : 0));
}

function drawTable(c: Cursor, t: ProposalTable) {
  const widths = columnWidths(c, t);
  const xs: number[] = [];
  let x = MARGIN;
  for (const w of widths) { xs.push(x); x += w; }

  // The header is bold throughout; a body cell is bold only if it was written
  // that way, which is how a total row keeps its weight.
  const fontsFor = (cells: string[], head: boolean) =>
    cells.map((v) => (head || isBoldCell(v) ? c.fonts.bodyBold : c.fonts.body));

  const wrapRow = (cells: string[], head: boolean, size: number) => {
    const fonts = fontsFor(cells, head);
    return cells.map((v, col) =>
      wrap(plain(v), fonts[col], size, Math.max(12, widths[col] - TABLE_PAD)));
  };

  const heightOf = (wrapped: string[][], lead: number) =>
    Math.max(1, ...wrapped.map((l) => l.length)) * lead;

  // No room check inside: callers decide where a row may land, because the
  // header has to be redrawn after a break and a mid-row break would orphan it.
  const drawRow = (
    cells: string[],
    head: boolean,
    size: number,
    color: typeof INK,
    lead: number,
  ) => {
    const fonts = fontsFor(cells, head);
    const wrapped = wrapRow(cells, head, size);
    const top = c.y;
    wrapped.forEach((lines, col) => {
      const font = fonts[col];
      let y = top - size;
      for (const line of lines) {
        const w = font.widthOfTextAtSize(line, size);
        const inner = widths[col] - TABLE_PAD;
        let lx = xs[col];
        if (t.align[col] === "right") lx = xs[col] + inner - w;
        else if (t.align[col] === "center") lx = xs[col] + (inner - w) / 2;
        c.page.drawText(line, { x: lx, y, size, font, color });
        y -= lead;
      }
    });
    c.y = top - heightOf(wrapped, lead);
  };

  const rule = (color: typeof SAND, thickness: number) => {
    c.page.drawLine({
      start: { x: MARGIN, y: c.y }, end: { x: MARGIN + CONTENT_W, y: c.y },
      thickness, color,
    });
  };

  const header = () => {
    drawRow(t.head.map((h) => h.toUpperCase()), true, TABLE_HEAD_SIZE, BRONZE, 11);
    c.y -= 4;
    rule(SAND, 0.75);
    c.y -= 9;
  };

  c.gap(10);
  // A header alone at the foot of a page is worse than a slightly short page.
  c.room(64);
  header();

  t.rows.forEach((row, idx) => {
    const needed = heightOf(wrapRow(row, false, TABLE_CELL_SIZE), TABLE_LEAD) + 12;
    const fresh = c.y >= PAGE_H - MARGIN - 1;
    if (c.y - needed < MARGIN + 40 && !fresh) {
      c.break();
      header();
    }
    drawRow(row, false, TABLE_CELL_SIZE, CHARCOAL, TABLE_LEAD);
    c.y -= 6;
    rule(idx === t.rows.length - 1 ? SAND : MIST, idx === t.rows.length - 1 ? 0.75 : 0.5);
    c.y -= 6;
  });

  c.gap(6);
}

/** Draw the section body, honouring the five constructs the brief allows. */
function drawBody(c: Cursor, md: string) {
  const lines = md.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trimEnd();

    if (!line.trim()) { c.gap(6); i++; continue; }

    const parsed = parseTable(lines, i);
    if (parsed) {
      drawTable(c, parsed.table);
      i = parsed.next;
      continue;
    }

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

  // A proposal that renders in the wrong serif is worth far more than one that
  // does not render at all, so a font problem degrades to the old Times pair
  // rather than throwing. It logs, because a silent downgrade on a document
  // that goes to a client is the thing actually worth knowing about.
  let display: Fonts["display"];
  let displayItalic: Fonts["displayItalic"];
  try {
    doc.registerFontkit(fontkit);
    display = await doc.embedFont(gelasioRegular(), { subset: true });
    displayItalic = await doc.embedFont(gelasioItalic(), { subset: true });
  } catch (err) {
    console.error("[proposal-pdf] Gelasio embed failed, falling back to Times:", err);
    display = await doc.embedFont(StandardFonts.TimesRoman);
    displayItalic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  }

  const fonts: Fonts = {
    body: await doc.embedFont(StandardFonts.Helvetica),
    bodyBold: await doc.embedFont(StandardFonts.HelveticaBold),
    display,
    displayItalic,
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
  const sections = writtenSections(content).map((s) => {
    const { thesis, rest } = liftThesis((s.body ?? "").trim());
    return {
      heading: stripSectionNumber((s.heading ?? "").trim()) || "Untitled section",
      purpose: stripSectionNumber((s.summary ?? "").trim()),
      thesis,
      body: rest,
    };
  });

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
    c.text(s.thesis || s.heading, { font: fonts.display, size: 24, color: INK, lead: 30 });
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
