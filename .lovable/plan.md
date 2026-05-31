
# Social Media Post & Carousel Builder

A new **Social** tab inside the admin project view (before Settings) that uses each client's intake + brand kit + business brain to generate batches of on-brand single posts (1080x1350) and carousels (2–10 slides, 1080x1350), then publishes approved posts to CoPost.

## 1. New tab: Social

Inserted in `AutomationBuildView.tsx` tab list **between Tasks and Settings**.

The tab has three sub-areas:
- **New batch** — form to start a generation run
- **Batches** — list of generation runs with status (drafting / ready_for_review / approved / published)
- **Batch detail** — per-batch review grid showing each post (copy + caption + rendered slide images) with Approve / Regenerate / Edit / Send to CoPost

## 2. New batch form

Admin specifies:
- Number of **single posts** (0–20)
- Number of **carousels** (0–20) and slides per carousel (default 5, range 2–10)
- Optional theme / campaign brief (free text, e.g. "spring promo, focus on transformation stories")
- Optional platform target (Instagram / LinkedIn — affects caption length + hashtag style)

Hitting "Generate" creates a `social_post_batch` row and fires the `generate-social-posts` edge function.

## 3. Generation pipeline (one-stage: copy + design together)

The orchestrator runs per batch:

```text
[1] Load context
     ├── clients.intake_data, intake_summary, brand_voice_doc
     ├── brand_kit_intake (colors, fonts, logo, one-liner)
     └── business brain artifacts (existing generate-brain-artifacts output)

[2] For each requested post (parallelized in chunks):
     Claude pass A — COPY
       → returns { hook, body, caption, hashtags, slides[]? }
     Claude pass B — DESIGN SPEC
       → returns structured JSON layout per slide:
         { background, layers:[{type:text|shape|image, ...}], palette, font_stack }
     Render pass
       → spec compiled to branded HTML/CSS (one template family per format,
         driven by brand kit tokens) → POST to HTML-to-image service →
         PNG uploaded to `social-posts` storage bucket
     Insert social_posts row with status='draft'

[3] Batch status → 'ready_for_review' when all posts succeed
```

### Rendering note (important)

Supabase Edge Functions run Deno and **cannot run Puppeteer/headless Chrome** directly. To honor the "Claude designs HTML/CSS → PNG" approach, the render step calls an HTML-to-image API. I'd recommend **HCTI (htmlcsstoimage.com)** or **Browserless** — both accept HTML + viewport and return a PNG. This requires one new secret (`HTMLCSS_API_KEY` or `BROWSERLESS_API_KEY`). All HTML/CSS is still authored by Claude; the API just rasterizes it. (Alternative if you'd rather not add a service: Claude → SVG → rasterize in Deno via `resvg`. Confirm preference before build.)

## 4. Review UI (batch detail)

Grid of cards, one per generated post:
- Rendered preview (single image, or horizontal slide strip for carousels with arrows)
- Editable caption + hashtags
- Editable copy per slide (textarea)
- Buttons: **Approve**, **Regenerate copy**, **Regenerate design**, **Discard**
- Top of batch: **Approve all** + **Send approved to CoPost**

## 5. Settings tab additions

Inside the existing Settings tab (next to `ProjectSecretsPanel`), add a **CoPost** card with one field: `copost_api_key` (and any other fields the CoPost docs require — workspace id, account id, etc.). Saves through the existing `add-project-secret` edge function with new allow-listed keys.

## 6. CoPost integration

A new edge function `send-to-copost` that:
1. Loads the approved `social_posts` rows for the batch
2. Loads `copost_api_key` from `project_secrets`
3. Uploads each image to CoPost (or sends hosted Supabase Storage URLs — depends on the API)
4. Creates the post/carousel with caption + scheduled time (optional)
5. Writes back `copost_post_id`, `published_at`, `status='published'`

**Blocker:** I need the CoPost docs you mentioned to finalize the exact request shape. The function will be scaffolded with a clearly marked `TODO: replace with real CoPost endpoint` block until you paste them.

## 7. Technical Details

### Database (one migration)

```sql
CREATE TABLE public.social_post_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id uuid NOT NULL REFERENCES client_projects(id) ON DELETE CASCADE,
  created_by uuid,
  status text NOT NULL DEFAULT 'drafting',  -- drafting|ready_for_review|approved|publishing|published|error
  brief text,
  platform text,                            -- 'instagram'|'linkedin'|null
  single_count int NOT NULL DEFAULT 0,
  carousel_count int NOT NULL DEFAULT 0,
  slides_per_carousel int NOT NULL DEFAULT 5,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES social_post_batches(id) ON DELETE CASCADE,
  client_project_id uuid NOT NULL,
  order_index int NOT NULL DEFAULT 0,
  format text NOT NULL,                     -- 'single'|'carousel'
  status text NOT NULL DEFAULT 'draft',     -- draft|approved|publishing|published|error
  caption text,
  hashtags text[],
  slides jsonb NOT NULL DEFAULT '[]',       -- [{ copy, design_spec, image_path, image_url }]
  copost_post_id text,
  published_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- GRANTs to authenticated + service_role, RLS via is_admin(auth.uid())
-- Storage bucket: 'social-posts' (private; signed URLs for preview)
```

`add-project-secret` allow-list extended to accept `copost_api_key` (+ any extra CoPost fields once docs are in).

### Edge functions

- `generate-social-posts/index.ts` — orchestrator
- `generate-social-posts/prompts.ts` — Claude prompts: `COPY_PROMPT`, `DESIGN_SPEC_PROMPT`
- `generate-social-posts/render.ts` — design-spec → HTML/CSS → HCTI/Browserless → upload PNG
- `regenerate-social-post/index.ts` — re-runs a single post (copy only, design only, or both)
- `send-to-copost/index.ts` — pushes approved posts

All `verify_jwt = true` except internal triggers.

### Frontend files

- `src/components/admin/social/SocialTab.tsx`
- `src/components/admin/social/NewBatchDialog.tsx`
- `src/components/admin/social/BatchList.tsx`
- `src/components/admin/social/BatchDetail.tsx`
- `src/components/admin/social/PostCard.tsx` (carousel viewer w/ slide nav)
- `src/components/admin/social/CoPostSettingsCard.tsx` (added to Settings tab alongside `ProjectSecretsPanel`)
- Tab registered in `AutomationBuildView.tsx` between Tasks and Settings

### Claude model

`google/gemini-3-flash-preview` via Lovable AI Gateway for copy (fast, cheap). For design specs I'd use `openai/gpt-5` or `google/gemini-2.5-pro` — better at producing valid structured layout JSON. Tool-calling JSON schema to guarantee shape.

## 8. Open items / confirmations needed before build

1. **CoPost docs** — paste link/reference so I can wire `send-to-copost` properly. Until then it ships scaffolded with a stub.
2. **Rendering service** — OK to add HCTI or Browserless as the HTML→PNG renderer? (Required because Deno edge can't run Puppeteer.) If not, I'll fall back to Claude→SVG→`resvg` rasterization, which limits typography/effects.
3. **Single post size** — you wrote 1080x1350 (portrait). Locking that in for both single + carousel unless you want IG-square 1080x1080 as an option too.
