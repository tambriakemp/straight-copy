// Prompts for the social post generation pipeline.

export interface BrandContext {
  business_name: string | null;
  one_liner: string | null;
  voice_doc: string | null;
  voice_quick_ref: string | null;
  intake_summary: string | null;
  intake_data: unknown;
  brand_kit: unknown; // brand_kit_intake jsonb (colors, fonts, logo)
}

export interface CopyRequest {
  format: "single" | "carousel";
  slides_per_carousel?: number;
  brief?: string | null;
  platform?: string | null;
  index: number;
  total: number;
}

export interface SlideCopy {
  heading: string;
  body: string;
  // For carousels: optional cta label on final slide
  cta?: string | null;
}

export interface PostCopy {
  hook: string;
  caption: string;
  hashtags: string[];
  slides: SlideCopy[];
}

export interface SlideDesign {
  background: string; // hex or gradient css value
  text_color: string;
  accent_color: string;
  layout: "centered" | "left-aligned" | "split" | "stat" | "cta";
  heading_font_size_px: number;
  body_font_size_px: number;
  // raw html body — server wraps in template
  inner_html: string;
}

export interface PostDesign {
  font_family_heading: string;
  font_family_body: string;
  slides: SlideDesign[];
}

export const COPY_SYSTEM = `You are a senior social media strategist writing for a brand.
You will receive the brand context and produce ONE social post (single image OR carousel).
Voice must mirror the brand voice doc. Hooks must stop the scroll.
Captions must feel native to the platform. Hashtags are 5-15 tightly relevant tags.
Return ONLY via the function tool 'emit_post'.`;

export function buildCopyUserPrompt(ctx: BrandContext, req: CopyRequest): string {
  const slides = req.format === "carousel" ? (req.slides_per_carousel ?? 5) : 1;
  return [
    `# Brand`,
    `Business: ${ctx.business_name ?? "(unknown)"}`,
    `One-liner: ${ctx.one_liner ?? "—"}`,
    ``,
    `# Brand Voice`,
    (ctx.voice_quick_ref ?? ctx.voice_doc ?? "(none provided)").slice(0, 4000),
    ``,
    `# Intake Summary`,
    (ctx.intake_summary ?? "—").slice(0, 2000),
    ``,
    `# Brand Kit`,
    JSON.stringify(ctx.brand_kit ?? {}).slice(0, 2000),
    ``,
    `# Request`,
    `Format: ${req.format}`,
    `Slides: ${slides}`,
    `Platform: ${req.platform ?? "instagram"}`,
    `Campaign brief: ${req.brief ?? "(none — pick a fresh angle relevant to the brand)"}`,
    `This is post ${req.index + 1} of ${req.total}. Make it distinct from sibling posts.`,
    ``,
    `Rules:`,
    `- Each slide.heading: 4-9 words, punchy.`,
    `- Each slide.body: 1-3 sentences max.`,
    `- For carousels: slide 1 is the hook, last slide is CTA.`,
    `- For single posts: produce exactly 1 slide.`,
    `- Caption: 1-3 short paragraphs, ends with subtle CTA.`,
    `- Hashtags: lowercase, no #, 5-15 items.`,
  ].join("\n");
}

export const COPY_TOOL = {
  type: "function" as const,
  function: {
    name: "emit_post",
    description: "Return the final post copy.",
    parameters: {
      type: "object",
      properties: {
        hook: { type: "string" },
        caption: { type: "string" },
        hashtags: { type: "array", items: { type: "string" } },
        slides: {
          type: "array",
          items: {
            type: "object",
            properties: {
              heading: { type: "string" },
              body: { type: "string" },
              cta: { type: "string", nullable: true },
            },
            required: ["heading", "body"],
          },
        },
      },
      required: ["hook", "caption", "hashtags", "slides"],
      additionalProperties: false,
    },
  },
};

export const DESIGN_SYSTEM = `You are a senior brand designer producing high-end social slides.
You will receive the brand kit + the approved copy. Output a design spec per slide.
Use the brand colors. Keep typography hierarchy tight. Vary layouts across slides.
Return ONLY via the function tool 'emit_design'.`;

export function buildDesignUserPrompt(ctx: BrandContext, copy: PostCopy, format: "single" | "carousel"): string {
  return [
    `# Brand Kit`,
    JSON.stringify(ctx.brand_kit ?? {}).slice(0, 2000),
    ``,
    `# Copy to design`,
    JSON.stringify({ format, slides: copy.slides }),
    ``,
    `Rules:`,
    `- Canvas is 1080x1350 portrait.`,
    `- Use brand kit hex colors. If none, choose a sophisticated minimal palette.`,
    `- inner_html may use <h1>, <p>, <span>, <div class="accent"> only. No images, no scripts.`,
    `- heading_font_size_px between 56 and 110.`,
    `- body_font_size_px between 26 and 40.`,
    `- layout values must vary across slides for carousels.`,
    `- background may be a single hex like "#0F1B3D" or a CSS gradient like "linear-gradient(135deg,#0F1B3D,#1E3A5F)".`,
  ].join("\n");
}

export const DESIGN_TOOL = {
  type: "function" as const,
  function: {
    name: "emit_design",
    description: "Return the final design spec for all slides.",
    parameters: {
      type: "object",
      properties: {
        font_family_heading: { type: "string" },
        font_family_body: { type: "string" },
        slides: {
          type: "array",
          items: {
            type: "object",
            properties: {
              background: { type: "string" },
              text_color: { type: "string" },
              accent_color: { type: "string" },
              layout: { type: "string", enum: ["centered", "left-aligned", "split", "stat", "cta"] },
              heading_font_size_px: { type: "number" },
              body_font_size_px: { type: "number" },
              inner_html: { type: "string" },
            },
            required: ["background", "text_color", "accent_color", "layout", "heading_font_size_px", "body_font_size_px", "inner_html"],
          },
        },
      },
      required: ["font_family_heading", "font_family_body", "slides"],
      additionalProperties: false,
    },
  },
};
