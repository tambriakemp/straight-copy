// Render slides using an admin-uploaded HTML template as a strict visual skeleton.
// The template HTML is sanitized (scripts stripped) and we swap content slots via
// either explicit {{placeholders}} or AI-driven inner_html injection into the
// first heading/body nodes. PNG render uses HCTI like the default pipeline.

const HCTI_USER_ID = Deno.env.get("HCTI_USER_ID") ?? "";
const HCTI_API_KEY = Deno.env.get("HCTI_API_KEY") ?? "";

export interface SlideCopy {
  heading: string;
  body: string;
  cta?: string | null;
}

/** Strip <script> tags and on*="" handlers from arbitrary template HTML. */
export function sanitizeTemplateHtml(html: string): string {
  let out = html;
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "");
  // Drop embedded bundler payloads (manifests/templates) from exported Lovable HTML.
  out = out.replace(/<script[^>]*type="__bundler\/[^"]+"[^>]*>[\s\S]*?<\/script>/gi, "");
  // Strip inline event handlers like onclick="..."
  out = out.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, "");
  // Remove the bundler loading/thumbnail overlays if present.
  out = out.replace(/<div\s+id="__bundler_(loading|thumbnail|err|placeholder)"[\s\S]*?<\/div>/gi, "");
  return out;
}

/** Try to detect repeated slide elements inside the template. */
export function detectSlideContainers(html: string): string[] {
  // Look for elements that look like slides: class containing "slide" / "card" / data-slide.
  const matches: string[] = [];
  const re = /<(section|article|div)[^>]*(?:class="[^"]*\b(?:slide|carousel-slide|post-slide|card)\b[^"]*"|data-slide(?:="[^"]*")?)[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) matches.push(m[0]);
  return matches;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Substitute slide copy into the template.
 * Strategy:
 *  1. If the template contains {{heading}}/{{body}}/{{cta}}/{{slide_n_heading}} placeholders, replace them.
 *  2. Otherwise, replace the FIRST <h1|h2|h3> text with heading and FIRST <p> text with body.
 *     For multi-slide templates we render one slide per copy entry by repeating the
 *     detected slide container.
 */
export function renderTemplateForSlide(
  templateHtml: string,
  slide: SlideCopy,
  slideIndex: number,
  totalSlides: number,
): string {
  let html = templateHtml;

  // 1. Placeholder substitution (most reliable when the template author opted in)
  const placeholders: Record<string, string> = {
    "{{heading}}": escapeHtml(slide.heading ?? ""),
    "{{body}}": escapeHtml(slide.body ?? ""),
    "{{cta}}": escapeHtml(slide.cta ?? ""),
    "{{slide_number}}": String(slideIndex + 1),
    "{{slide_total}}": String(totalSlides),
    [`{{slide_${slideIndex + 1}_heading}}`]: escapeHtml(slide.heading ?? ""),
    [`{{slide_${slideIndex + 1}_body}}`]: escapeHtml(slide.body ?? ""),
  };
  let didReplace = false;
  for (const [k, v] of Object.entries(placeholders)) {
    if (html.includes(k)) {
      html = html.split(k).join(v);
      didReplace = true;
    }
  }
  if (didReplace) return html;

  // 2. Heuristic: replace the first heading + first paragraph in the body.
  html = html.replace(/<(h1|h2|h3)([^>]*)>[\s\S]*?<\/\1>/i,
    (_m, tag, attrs) => `<${tag}${attrs}>${escapeHtml(slide.heading ?? "")}</${tag}>`);
  html = html.replace(/<p([^>]*)>[\s\S]*?<\/p>/i,
    (_m, attrs) => `<p${attrs}>${escapeHtml(slide.body ?? "")}</p>`);
  if (slide.cta) {
    html = html.replace(/<(a|button)([^>]*)>[\s\S]*?<\/\1>/i,
      (_m, tag, attrs) => `<${tag}${attrs}>${escapeHtml(slide.cta ?? "")}</${tag}>`);
  }
  return html;
}

export async function renderTemplateToPng(html: string): Promise<Uint8Array> {
  if (!HCTI_USER_ID || !HCTI_API_KEY) throw new Error("HCTI credentials missing");
  const auth = btoa(`${HCTI_USER_ID}:${HCTI_API_KEY}`);
  const res = await fetch("https://hcti.io/v1/image", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      html,
      viewport_width: 1080,
      viewport_height: 1350,
      device_scale: 1,
      ms_delay: 600,
    }),
  });
  if (!res.ok) throw new Error(`HCTI failed: ${res.status} ${await res.text()}`);
  const j = await res.json() as { url: string };
  const img = await fetch(j.url);
  if (!img.ok) throw new Error(`Image fetch failed: ${img.status}`);
  return new Uint8Array(await img.arrayBuffer());
}
