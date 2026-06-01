## 1. Copy change

In `src/components/ServicesSection.tsx`, rename the first automation:
- `num: "Automation 01"` → `num: "Automation 01: Lead Gen"`

## 2. SureContact landing-page API — what's live

Probed the live API and pulled the official docs. Landing Page endpoints under `/api/v1/public/pages`:

| Method | Path | What it does |
|---|---|---|
| GET | `/api/v1/public/pages` | List pages |
| GET | `/api/v1/public/pages/{uuid}` | Get a page incl. full `design_json` |
| POST | `/api/v1/public/pages` | **Create as draft.** Accepts `design_json`. |
| PUT | `/api/v1/public/pages/{uuid}` | Update content, SEO, OG, tracking, thumbnail |
| DELETE | `/api/v1/public/pages/{uuid}` | Soft-delete |

Not exposed: no publish endpoint, no slug/custom-domain setter, no public `page-templates` list. Publishing + slug + custom domain still happen in the SureContact UI.

## 3. Approach — full design_json generation

Skipping template setup. The agency-side flow becomes:

1. **Reverse-engineer the `design_json` schema** by creating one reference landing page in the SureContact UI, then `GET /api/v1/public/pages/{uuid}` and capturing the full structure. Document the block types we care about (hero, headline, subhead, bullets, form, CTA, footer, image).
2. **Generate `design_json` server-side** in a new edge function using Lovable AI (default `google/gemini-3-flash-preview`, tool-calling for structured output) given the BrandCtx + lead-magnet output.
3. **POST `/pages`** with the generated `design_json`, then **PUT** SEO/OG/tracking. Store returned `page_uuid` + draft URL on the project. Surface a "Create landing page" button on the project view that runs the function and shows the draft link.

Risk: the `design_json` schema is unpublished. If a future SureContact update changes the shape, the generator needs to be re-fitted against a fresh reference page. Mitigation: keep the reference-page capture step rerunnable.

## 4. Data the generator needs (all already on file)

Pulled from `BrandCtx` in `supabase/functions/build-automation-01/prompts.ts` + the lead-magnet copy step:

- Business name, one-liner, audience
- Primary + accent hex colors
- Heading + body font names
- Logo URL
- Brand voice doc + quick reference
- Lead magnet title, headline, subhead, 3 benefit bullets, form label, CTA button text, trust line, footer line
- Lead-magnet PDF download URL
- Optional hero/thumbnail image URL

No client form. The agency owns page name, SEO title/description, OG image, canonical, no_index, GTM ID, Pixel ID, and slug/publish in the UI — captured as a single task below.

## 5. Tasks

Two new tasks under the Lead Gen epic (or roll #2 into the existing build-automation-01 task if you'd rather):

- **Task: Capture SureContact landing-page `design_json` reference.** Build one on-brand landing page in the SureContact UI, GET it via the API, save the JSON to `supabase/functions/_shared/surecontact-page-schema.json`, and document the block types in a short README.
- **Task: Agency landing-page finalization checklist.** For each generated draft, agency fills in: page name, SEO title (≤70), SEO description (≤170), OG image URL, OG title/description, canonical URL, `no_index`, GTM container ID, Meta Pixel ID, thumbnail URL, slug, custom domain (if any), then hits Publish in SureContact.

## Technical notes
- Use existing `SURECONTACT_API_KEY` and the `X-API-Key` header pattern from `send-preview-review-email`.
- New edge function `create-lead-magnet-landing-page` (verify_jwt = false to match siblings; auth via project secret check).
- Add `surecontact_page_uuid` + `surecontact_page_draft_url` columns to the project table when the function ships (separate migration, not part of the rename PR).