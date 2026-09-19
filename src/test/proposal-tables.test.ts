import { describe, expect, it } from "vitest";
import {
  parseTable,
  renderProposalHtml,
} from "../../supabase/functions/_shared/agents/proposal-spine";

const lines = (s: string) => s.trim().split("\n");

// The shape the real investment breakdowns take.
const INVESTMENT = `
| Deliverable | Cadence | Investment |
| --- | --- | ---: |
| SEO articles | 5 / month | $2,000 |
| Paid social management | Ongoing | $1,200 |
`;

describe("parseTable", () => {
  it("reads the header, the rows and the alignment", () => {
    const got = parseTable(lines(INVESTMENT), 0);
    expect(got).not.toBeNull();
    expect(got!.table.head).toEqual(["Deliverable", "Cadence", "Investment"]);
    expect(got!.table.rows).toEqual([
      ["SEO articles", "5 / month", "$2,000"],
      ["Paid social management", "Ongoing", "$1,200"],
    ]);
    expect(got!.table.align).toEqual(["left", "left", "right"]);
    expect(got!.next).toBe(4);
  });

  it("reads every alignment marker", () => {
    const got = parseTable(lines(`
| a | b | c | d |
| :--- | ---: | :---: | --- |
| 1 | 2 | 3 | 4 |
`), 0);
    expect(got!.table.align).toEqual(["left", "right", "center", "left"]);
  });

  it("does not need the outer pipes", () => {
    const got = parseTable(lines(`
Item | Cost
--- | ---:
Discovery | $4,000
`), 0);
    expect(got!.table.head).toEqual(["Item", "Cost"]);
    expect(got!.table.rows).toEqual([["Discovery", "$4,000"]]);
  });

  it("is not a table without the delimiter row", () => {
    expect(parseTable(lines(`
| Deliverable | Investment |
| SEO articles | $2,000 |
`), 0)).toBeNull();
  });

  // "| - | - |" is punctuation, not a table. Three dashes minimum.
  it("does not take a one-dash row as a delimiter", () => {
    expect(parseTable(lines(`
| a | b |
| - | - |
| 1 | 2 |
`), 0)).toBeNull();
  });

  it("is not a table when the delimiter does not match the header width", () => {
    expect(parseTable(lines(`
| a | b | c |
| --- | --- |
| 1 | 2 | 3 |
`), 0)).toBeNull();
  });

  it("needs at least two columns, so a line of prose with a pipe stays prose", () => {
    expect(parseTable(lines(`
| just one |
| --- |
| value |
`), 0)).toBeNull();
  });

  // A miscounted cell must not shift the column its neighbours land in.
  it("pads a short row and truncates a long one", () => {
    const got = parseTable(lines(`
| a | b | c |
| --- | --- | --- |
| 1 | 2 |
| 1 | 2 | 3 | 4 |
`), 0);
    expect(got!.table.rows).toEqual([
      ["1", "2", ""],
      ["1", "2", "3"],
    ]);
  });

  it("stops at the blank line after the table", () => {
    const src = lines(`
| a | b |
| --- | --- |
| 1 | 2 |
`).concat(["", "And then some prose."]);
    const got = parseTable(src, 0);
    expect(got!.next).toBe(3);
    expect(got!.table.rows).toHaveLength(1);
  });

  it("finds a table that does not start at the first line", () => {
    const src = ["Some prose first.", "", ...lines(INVESTMENT)];
    expect(parseTable(src, 0)).toBeNull();
    expect(parseTable(src, 2)!.table.head).toHaveLength(3);
  });
});

describe("renderProposalHtml with a table", () => {
  const html = (body: string) =>
    renderProposalHtml("Menovia", {
      sections: [{ heading: "Investment", summary: "What it costs", body }],
    });

  it("renders a real table, not a paragraph of pipes", () => {
    const out = html(INVESTMENT);
    expect(out).toContain("<table>");
    expect(out).toContain("<th style=\"text-align:left\">Deliverable</th>");
    expect(out).toContain("<td style=\"text-align:right\">$2,000</td>");
    // The regression this fixes: every row used to arrive as <p>| … |</p>.
    expect(out).not.toContain("<p>|");
  });

  it("keeps a money column right-aligned in both head and body", () => {
    const out = html(INVESTMENT);
    expect(out).toContain("<th style=\"text-align:right\">Investment</th>");
    expect(out).toContain("<td style=\"text-align:right\">$1,200</td>");
  });

  it("renders inline markdown inside cells", () => {
    const out = html(`
| Item | Note |
| --- | --- |
| **Discovery** | *included* |
`);
    expect(out).toContain("<strong>Discovery</strong>");
    expect(out).toContain("<em>included</em>");
  });

  it("escapes cell content", () => {
    const out = html(`
| Item | Note |
| --- | --- |
| <script> | a & b |
`);
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("a &amp; b");
    expect(out).not.toContain("<script>");
  });

  it("still renders the constructs that came before it", () => {
    const out = html(`
## Terms

Prose paragraph.

- a bullet

> a callout

| a | b |
| --- | --- |
| 1 | 2 |
`);
    expect(out).toContain("<h3>Terms</h3>");
    expect(out).toContain("<p>Prose paragraph.</p>");
    expect(out).toContain("<li>a bullet</li>");
    expect(out).toContain("<blockquote>a callout</blockquote>");
    expect(out).toContain("<table>");
  });

  it("closes an open list before the table starts", () => {
    const out = html(`
- a bullet

| a | b |
| --- | --- |
| 1 | 2 |
`);
    expect(out.indexOf("</ul>")).toBeLessThan(out.indexOf("<table>"));
  });
});
