## Problem

When you ask the AI editor to tweak the marquee strip (e.g. center the green dot between phrases), it's inserting a dot/separator between every individual word. The model can't actually see the rendered page — it only gets raw HTML text and has to guess what the user means by "the scroll bar" or "between the phrases." With CSS-driven marquees, the structural unit (a phrase like "Penalty Abatement") often isn't wrapped in its own element, so the model treats every whitespace-separated token as a "phrase."

## Fix

Three changes to `preview-ai-edit` plus a small dialog tweak so the model has enough context to reason about visual layout.

### 1. Send attached images to the model as vision input

Right now, images uploaded in the dialog are saved to storage and listed by filename in the prompt — the model never actually sees them. Change the request payload so each attachment is included as an `image_url` content part on the user message. This lets you drop in your screenshot of the broken marquee and say "fix the dot spacing shown here" and the model will understand.

### 2. Tighten the system prompt for inline/marquee structures

Add explicit guidance:
- Identify the smallest structural unit (the existing repeating element — `<span>`, `<li>`, etc.) before adding any separator.
- Never insert separators between tokens that share the same parent element with no wrapper around each phrase.
- For marquees and ticker strips, treat each direct child of the track as one item; do not split text nodes.
- Preserve existing whitespace and inline structure exactly outside the changed region.

### 3. Switch back to `gemini-2.5-pro` for these edits

We dropped to flash to dodge the 150s timeout, but streaming already solves that. Pro handles structural HTML reasoning (like correctly identifying marquee items) noticeably better. Keep flash as a fallback only if pro returns 429.

### 4. Dialog copy

Update the AiEditDialog hint under the prompt: "Attach a screenshot of the area you want changed — the AI will see it." So users know the attachment now doubles as visual reference, not just an asset to embed.

## Technical details

- `supabase/functions/preview-ai-edit/index.ts`:
  - Accept attachments either as the existing `new_assets` (path-only) or as a new `vision_attachments: [{ data_url, mime }]` array. Client sends both: small images as data URLs for vision, plus the storage path for embedding.
  - Build the user message as `content: [{ type: "text", text: "..." }, { type: "image_url", image_url: { url: dataUrl } }, ...]` when vision attachments exist.
  - Update `model` to `google/gemini-2.5-pro`.
  - Expand system prompt with the marquee/inline rules above.
- `src/components/admin/preview/AiEditDialog.tsx`:
  - When invoking `preview-ai-edit`, also pass `vision_attachments` built from the same files (data URL + mime). Skip files larger than ~4 MB to keep payload sane.
  - Update helper text under the prompt textarea.

## Out of scope

- Auto-screenshotting the live preview server-side (would be ideal but adds a headless browser dependency — revisit later).
- Diff preview before apply.
