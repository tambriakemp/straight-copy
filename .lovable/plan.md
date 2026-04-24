

## Plan: Switch all AI calls from Lovable AI Gateway to Anthropic Claude

Move every AI invocation in the project off `ai.gateway.lovable.dev` (Gemini/GPT-5) and onto Anthropic's Claude API. No other functional changes.

### Scope — files that currently call the AI gateway

1. `supabase/functions/onboarding-chat/index.ts` — streaming onboarding conversation
2. `supabase/functions/onboarding-session/index.ts` — `complete` action runs the structured-summary extraction
3. `supabase/functions/save-onboarding/index.ts` — legacy summary extraction (kept in sync for parity)

These are the only three places. Everything else (email, webhooks, CRM API) is non-AI and stays untouched.

### What changes in each function

**Endpoint**
- From: `https://ai.gateway.lovable.dev/v1/chat/completions`
- To: `https://api.anthropic.com/v1/messages`

**Auth headers**
- From: `Authorization: Bearer ${LOVABLE_API_KEY}`
- To: `x-api-key: ${ANTHROPIC_API_KEY}` + `anthropic-version: 2023-06-01`

**Request shape** (Anthropic differs from OpenAI-compatible):
- `system` becomes a top-level field, not a message with `role: "system"`
- `messages` array contains only `user` / `assistant` turns
- `max_tokens` is required
- `stream: true` works the same way for SSE

**Model**
- Default to `claude-sonnet-4-5` (latest Sonnet — best balance for chat + structured extraction)
- One constant per function so it's easy to swap later

**Streaming (onboarding-chat only)**
Anthropic's SSE format is different from OpenAI's. The frontend currently parses `choices[0].delta.content`. I'll transform Anthropic's `content_block_delta` events into the same OpenAI-compatible shape inside the edge function so `Onboarding.tsx` keeps working with zero frontend changes. The transform is a small ReadableStream that maps each `event: content_block_delta` → `data: {"choices":[{"delta":{"content":"..."}}]}` and emits a final `data: [DONE]`.

**Structured JSON extraction (onboarding-session + save-onboarding)**
Replace OpenAI-style `response_format: { type: "json_object" }` with Anthropic tool-use:
- Define a single `extract_summary` tool whose input schema matches the existing summary shape
- Force the model to call it via `tool_choice: { type: "tool", name: "extract_summary" }`
- Read the structured object from `content[0].input` instead of parsing a JSON string

**Error handling**
- 429 → same "Rate limit reached" response
- 529 (Anthropic overloaded) → same rate-limit message
- 401 → "AI service authentication failed" (signals bad/missing key)
- All other errors → existing 500 path, with the Anthropic error body logged

### Secret

A new runtime secret `ANTHROPIC_API_KEY` is required. I'll request it via `add_secret` before deploying. `LOVABLE_API_KEY` stays in the secret store (still used by other potential features) but is no longer referenced by these three functions.

### Out of scope (explicitly not touching)

- No new features, no UI changes, no DB changes
- No changes to the journey flow / brand voice generator (that one wasn't built)
- Frontend `Onboarding.tsx` is unchanged — the SSE transform keeps the contract identical

### Risks / things to confirm after deploy

- Cost & latency profile changes (Claude Sonnet 4.5 is solid for this workload but priced differently than Gemini Flash)
- Tool-use JSON output is more reliable than `response_format`, so summary quality should be equal or better
- If you want a cheaper model for the summary step (e.g. `claude-haiku-4-5`), say so and I'll split the model constants

