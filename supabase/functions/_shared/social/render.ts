// Render a design spec slide to a PNG via HTMLCSStoImage and upload to storage.
import type { PostDesign, SlideDesign } from "./prompts.ts";

const HCTI_USER_ID = Deno.env.get("HCTI_USER_ID") ?? "";
const HCTI_API_KEY = Deno.env.get("HCTI_API_KEY") ?? "";

export function buildSlideHtml(slide: SlideDesign, design: PostDesign): string {
  const headingFont = design.font_family_heading || "Inter";
  const bodyFont = design.font_family_body || "Inter";
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(headingFont).replace(/%20/g, "+")}:wght@400;600;700;800&family=${encodeURIComponent(bodyFont).replace(/%20/g, "+")}:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1080px; height: 1350px; }
  body {
    background: ${slide.background};
    color: ${slide.text_color};
    font-family: '${bodyFont}', system-ui, sans-serif;
    padding: 88px 72px;
    display: flex;
    flex-direction: column;
    justify-content: ${slide.layout === "centered" || slide.layout === "stat" ? "center" : "flex-end"};
    align-items: ${slide.layout === "centered" || slide.layout === "stat" ? "center" : "flex-start"};
    text-align: ${slide.layout === "centered" || slide.layout === "stat" ? "center" : "left"};
    line-height: 1.25;
    overflow: hidden;
  }
  h1 {
    font-family: '${headingFont}', serif;
    font-weight: 700;
    font-size: ${slide.heading_font_size_px}px;
    line-height: 1.05;
    letter-spacing: -0.02em;
    margin-bottom: 28px;
  }
  p {
    font-size: ${slide.body_font_size_px}px;
    line-height: 1.4;
    max-width: 880px;
    opacity: 0.92;
  }
  .accent { color: ${slide.accent_color}; }
  div + p, p + p, h1 + p { margin-top: 18px; }
</style></head>
<body>
${slide.inner_html}
</body></html>`;
}

export async function renderSlideToPng(html: string): Promise<Uint8Array> {
  if (!HCTI_USER_ID || !HCTI_API_KEY) {
    throw new Error("HCTI credentials missing");
  }
  const auth = btoa(`${HCTI_USER_ID}:${HCTI_API_KEY}`);
  const res = await fetch("https://hcti.io/v1/image", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      html,
      viewport_width: 1080,
      viewport_height: 1350,
      device_scale: 1,
      ms_delay: 400,
    }),
  });
  if (!res.ok) throw new Error(`HCTI failed: ${res.status} ${await res.text()}`);
  const j = await res.json() as { url: string };
  const img = await fetch(j.url);
  if (!img.ok) throw new Error(`Image fetch failed: ${img.status}`);
  return new Uint8Array(await img.arrayBuffer());
}
