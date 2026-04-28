## Root cause (confirmed via edge function logs)

Logs show: `complete update failed: column "stage" of relation "clients" does not exist`.

The `create_client_from_onboarding` Postgres trigger on `onboarding_submissions` tries to `INSERT INTO public.clients (..., stage, ...)` but the `clients` table has no `stage` column (it has `pipeline_stage`). When the user finished the chat, the AI did emit `[[ONBOARDING_COMPLETE]]` and `onboarding-session` did call `action: complete` — but the trigger raised, rolling back the whole `UPDATE onboarding_submissions … SET completed=true` statement. That's why the submission shows `completed=false` with no summary, and why no brand-voice doc was generated.

The dryness of the conversation is a separate (real) issue with the system prompt.

## Plan

### 1. Fix the trigger (DB migration)

Drop `stage` from the `INSERT` in `create_client_from_onboarding`. The `clients` table uses `pipeline_stage` (default `'intake_submitted'`), so we just remove the bad column. Replace the function with the same logic minus that one column.

### 2. Recover the existing stuck submission

After the trigger is fixed, run a one-shot SQL update toggling `completed=false → true` on submission `d02b978d-…` to fire the trigger fresh. The `onboarding-session` `complete` path also calls `triggerBrandVoiceGeneration` only from the edge function, so for recovery we'll instead call the existing edge function directly with the saved conversation. Simpler: re-invoke `onboarding-session` `complete` for that token. We'll do that from the admin once deployed (or run a one-shot via the migration's edge invocation). I'll verify the submission lands `completed=true` with a summary, then a client row appears and brand voice generation kicks off.

### 3. Rewrite the AI prompt for warmth + context + adaptation

Replace `SYSTEM_PROMPT` in `supabase/functions/onboarding-chat/index.ts` so the AI:

- **Pairs every new question with one sentence of context** explaining why it matters for their brand voice doc.
- **Always offers 2 concrete examples** when introducing an abstract topic (tone words, ideal customer, etc.). Examples are short and varied — e.g. tone words: *"things like 'warm and direct,' 'playful but precise,' or 'no-nonsense Southern' — what fits Cre8 Visions?"*
- **Reads the previous answer's substance.** If <8 words or generic ("we help small businesses"), ask one targeted follow-up using their own words. If ≥15 words and specific, move forward.
- **Echoes the client's vocabulary back** ("howdy" → use it in the next prompt; "automation + documentation" → reference it).
- **Varies openers** — rotate reflections, observations, or just dive in. No more "Got it." / "Perfect —" every turn.
- **Bridges between stages** with a one-sentence transition: *"That gives me a clear picture of who you are. Let's talk about who you serve."*
- **Repairs gracefully** — if the user pushes back, rephrase with a different example instead of repeating.
- **Loosens the completion gate** — emit `[[ONBOARDING_COMPLETE]]` once *core* fields have substantive answers (name, business, what_they_do, primary_offer, tone_words, ideal_customer, customer_struggles, biggest_time_drain, 90_day_goal, tier). Don't loop forever on nice-to-haves.

Concrete prompt example:
> *"Now I want to capture how you actually sound — this becomes the heartbeat of every email and caption your AI writes. Think 2-3 words that feel like you on a good day. For some folks it's 'warm and direct,' others 'playful but precise,' or even 'no-nonsense Southern.' What fits?"*

### 4. Add a safety net "Wrap up & generate" button (`Onboarding.tsx`)

Once `stage >= 6` (Goals stage reached), show a subtle "Wrap up & generate my brand voice" button beneath the input. Clicking it calls `finalize(messages)` directly. This way, even if the AI hesitates to emit the completion sentinel, the client always has a way out.

Also: improve `finalize()` failure UX — instead of dumping to an empty summary view on error, keep the chat alive and show an inline retry banner.

## Technical notes

**Files to edit:**
- DB migration: replace `create_client_from_onboarding` function — drop `stage` from INSERT column list.
- `supabase/functions/onboarding-chat/index.ts` — replace `SYSTEM_PROMPT` (warmer, contextual, example-driven, adaptive, looser completion gate).
- `src/pages/Onboarding.tsx` — add "Wrap up & generate" CTA visible at `stage >= 6`; tighten `finalize()` error handling with retry.

**Recovery for submission `d02b978d-604e-46d5-9012-7b935938a2ab`:** After the trigger fix deploys, manually toggle `completed` on that row (UPDATE … SET completed=false then true) so the now-fixed trigger materializes the client. Then call `generate-brand-voice` for that client. I'll run these as ad-hoc steps after the migration applies.

**No prompt changes are required to fix the save bug** — it was purely a DB schema mismatch. The prompt rewrite addresses the separate "dry conversation" complaint.
