Yes — this is possible, and the `ANTHROPIC_API_KEY` is already present as a backend runtime secret. The reason it is not being reused is that the current social generator is hardcoded to use Lovable AI models (`google/gemini-2.5-flash` for copy and `google/gemini-2.5-pro` for design). Nothing in `generate-social-posts` or `regenerate-social-post` currently reads `ANTHROPIC_API_KEY` or calls Anthropic.

## Plan

1. **Add a per-client/project design template library**
   - Create a `social_design_templates` table linked to `client_projects`.
   - Store template name, format support (`single`, `carousel`, or both), HTML source, extracted design notes/tokens, active flag, and timestamps.
   - Add proper admin-only RLS and grants.
   - Add a private storage bucket only if we decide to store raw uploaded files outside the table; for normal HTML sizes, the table is enough.

2. **Add admin UI for template management**
   - Add a “Design Templates” section in the Social tab/settings area.
   - Allow uploading multiple HTML files per project/client.
   - Show the template library with name, supported format, active/inactive status, and delete/deactivate actions.
   - For new batches, allow choosing:
     - Auto-pick from active templates
     - A specific template
     - Fallback AI design if no template is configured

3. **Parse uploaded HTML into reusable design instructions**
   - Add a backend function to receive HTML uploads.
   - Extract CSS, visible structure, colors, typography, slide ratios, repeated slide sections, and placeholder-worthy text regions.
   - Support bundled/exported HTML like the attached Launchely file by extracting the embedded template payload when available.
   - Save a cleaned template plus structured “design tokens” so the generator can reproduce the look without executing arbitrary uploaded scripts.

4. **Render generated slides from templates**
   - Update the social rendering pipeline so template-based designs use the uploaded HTML as a strict visual skeleton.
   - Replace text slots with generated heading/body/CTA while allowing controlled token variation: color accents, slide-specific layouts, and minor design alternates.
   - Preserve the current HCTI PNG render/upload flow so CoPost publishing continues to receive image URLs the same way.
   - Keep the current AI-generated design path as a fallback.

5. **Switch copy/captions to Claude using the existing secret**
   - Add an Anthropic caller in the shared social backend code that reads `ANTHROPIC_API_KEY`.
   - Use Claude for caption, hook, slide text, thread text, and hashtag generation.
   - Keep structured output validation so the app still receives predictable fields.
   - Improve the copy prompt to require varied angles across a batch: different hooks, no repeated phrasing, platform-native captions, stronger opinions, and distinct CTA styles.
   - If the Anthropic secret is missing or invalid, return a clear error instead of silently falling back.

6. **Update regenerate/redesign behavior**
   - `Regenerate` will re-run Claude copy and re-render through the chosen template.
   - `Redesign` will keep the copy and rerender with the same or another active template.
   - Add clear toast errors for Anthropic/API/template parsing failures.

7. **Validate the flow**
   - Test template upload with the attached Launchely HTML.
   - Generate a batch using multiple templates.
   - Verify approve/regenerate/redesign still live-refresh.
   - Verify approved template-rendered posts still send to CoPost with the existing payload.

## Technical notes

- The existing `ANTHROPIC_API_KEY` runtime secret is configured; no new key should be needed.
- The key has been added repeatedly because the app never referenced it in these social functions.
- Uploaded HTML should be treated as an untrusted design source: we should not execute its scripts directly. We’ll parse/extract the design and render a sanitized template instead.