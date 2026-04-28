## What's wrong

**1. The save silently failed.**
Inspecting the most recent submission shows 36 messages, `completed=false`, no summary, last message is the client's "Growth" tier answer. The AI never emitted the `[[ONBOARDING_COMPLETE]]` sentinel, so `finalize()` was never called and the brand voice doc was never generated. The client thought they finished — the system thought they were mid-conversation.

Two contributing causes:
- The system prompt's completion gate is strict (19 required fields). If even one feels thin, the AI keeps asking and never emits the sentinel — but the client has run out of patience and stops typing.
- There is no "wrap up now" fallback. No client-side detector that says "we've covered enough — let's close it."
- No retry/visible error if the `complete` call fails. Right now if `finalize()` fails, the user just sees a toast and a blank summary.

**2. The conversation reads like a checklist.**
The current prompt tells the AI to ask "ONE QUESTION AT A TIME" with "1 short reflection" — which is exactly what produced the dry "Got it. So what does Cre8 Visions actually do?" tone. There is no instruction to:
- Give context for *why* a question matters
- Offer examples when an answer is vague
- Adapt depth based on whether the answer was rich or one-word
- Reframe abstract questions in concrete terms

## Plan

### A. Fix completion reliability (`onboarding-session` + `Onboarding.tsx` + `onboarding-chat`)

1. **Server-side safety net.** In `onboarding-chat/index.ts`, after the stream completes, if the assistant text contains a "wrap" signal (covered all 6 stages and asked tier) but no `[[ONBOARDING_COMPLETE]]`, log it. More importantly:

2. **Add an explicit "Finish" affordance in the UI.** Once `stage >= 6` (Goals stage reached) AND the user has answered at least one question in stage 6, show a subtle "Wrap up & generate my brand voice" button below the input. Clicking it calls a new `force_complete` path that:
   - Sends the existing transcript to `onboarding-session` with `action: "complete"` even without the sentinel
   - The server-side summary extractor (Claude tool-call) already tolerates partial data — it returns "Not specified" / `[]` for missing fields

3. **Loosen the AI's completion gate.** Change the system prompt: the AI may emit `[[ONBOARDING_COMPLETE]]` when it has *substantive* answers for the **core** fields (name, business, what_they_do, primary_offer, tone_words, ideal_customer, customer_struggles, biggest_time_drain, 90_day_goal, tier) — others are nice-to-have, not blockers. This prevents the AI from getting stuck in an interrogation loop.

4. **Surface save failures clearly.** In `Onboarding.tsx` `finalize()`, replace the silent toast with a retry button on the summary view if save fails, and keep the conversation view alive until save succeeds.

### B. Rewrite the AI personality and questioning style (`onboarding-chat/index.ts`)

Replace the current `SYSTEM_PROMPT` with one that instructs the AI to:

- **Always pair a question with one sentence of context** — "I'm asking because the brand voice doc uses this to..."
- **Always offer a concrete example** when introducing a new topic — e.g., for tone words: "Things like 'warm and direct' or 'playful but precise' — what fits you?"
- **Read the previous answer for richness.** If the answer is ≥15 words and specific, move on. If it's <8 words or generic ("we help small businesses"), ask exactly one targeted follow-up before advancing.
- **Use the client's own words back to them.** When they say "howdy" or "automation + documentation," weave those into the next question.
- **Vary openers.** Stop starting every reply with "Got it." / "Perfect —". Rotate through reflections, gentle observations, or just diving in.
- **Soften the stage transitions.** Add a one-sentence bridge when moving stages: "Okay — that gives me a clear picture of *who you are*. Let's talk about who you serve."
- **Conversational repair.** If the user seems confused or pushes back ("what do you mean?"), rephrase the question with a different example instead of repeating it.

Concrete example for the "tone words" question:
> Current: "what are 2-3 words that describe your tone? Not what you *want* to be — what feels natural to you right now."
>
> New: "Now I want to capture how you actually *sound*. This becomes the heartbeat of every email and caption your AI writes for you. Think of two or three words that feel like you on a good day — not aspirational, just true. For some people it's 'warm and direct,' for others 'playful but precise,' or even 'no-nonsense Southern.' What fits Cre8 Visions?"

### C. Verify the brand voice doc actually generates after a successful complete

Once `finalize()` succeeds for the existing 36-message submission, the `triggerBrandVoiceGeneration` helper should fire. We'll add a retry path in admin: a "Re-generate brand voice" button on the existing client detail (already present in some form) — or, simpler, add a one-time recovery that on `force_complete` re-invokes `generate-brand-voice` if the existing client row has `brand_voice_status != 'complete'`.

## Technical notes

**Files to edit:**
- `supabase/functions/onboarding-chat/index.ts` — replace `SYSTEM_PROMPT` (warmer, context+examples, adaptive); relax completion criteria.
- `supabase/functions/onboarding-session/index.ts` — accept the existing `action: "complete"` as a force-complete path (already does; just confirm Claude summary extractor handles partial transcripts → it does, returns "Not specified").
- `src/pages/Onboarding.tsx` — add "Wrap up & generate" button visible once `stage >= 6`; on click, call `finalize(messages)`. On `finalize()` failure, show inline retry instead of moving to summary view.

**Recovery for existing stuck submission `d02b978d`:**
After deploy, we can manually re-trigger via the admin client detail page (or a one-shot script) to run `complete` against this submission so the user's brand voice doc is generated without them re-doing the chat.

**No DB migrations needed.** The submissions table already supports partial data; the summary extractor already tolerates missing fields.
