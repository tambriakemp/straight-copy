# Why Bria keeps "sending" a proposal that never arrives

## What the conversation actually shows

I read the whole Bria thread and the rows behind it. The pattern is consistent:

- Every assistant row in Bria's history has `duration_ms`, `iterations` and `tool_calls` **null**, including the newest one from tonight. Those three columns are written only by the tool-loop path in `agent-chat`. Null on every row means the **deployed `agent-chat` is an older build than the source in this project** — the tool loop, the read tools (`search` / `query` / `get_record`) and the `propose_action` tool are simply not running for her.
- Bria has proposed exactly **four actions ever**, all `flag_risk`. **No `draft_proposal` has ever been created** — not once, in any turn where she said "Drafted", "Proposing it properly now", or "Here it is".
- Her 22:41 message tonight says the proposal is "proposed as a draft against Menovia Social Media" and its `action_ids` is empty. Nothing was written. That is the exact thing she apologised for at 05:04 and then did again.
- One turn at 06:37 is stored `complete` with completely empty content — a blank bubble.

So the repetition is not personality. On the old build she has no tools: she cannot look anything up, cannot see that last turn produced nothing, and the only way for her to create anything is a payload attached to her final reply — which she keeps forgetting to attach. Each turn she re-derives the same summary from the same static context blob and re-announces the same draft.

## Fixes

### 1. Deploy the current `agent-chat` (the main fix)

Redeploy `agent-chat` with `_shared/agents/*`. That alone gives Bria the tool loop, the read tools, and `propose_action` — where a `draft_proposal` runs immediately, returns a real proposal id, and the model is told plainly when something was only queued.

Verify it landed by sending one message and checking that the new assistant row has non-null `duration_ms`, `iterations` and `tool_calls`. A green deploy is not evidence.

### 2. Fix the crash waiting in the fallback path

`agent-chat/index.ts` line 617 reads `startedAt`, but `startedAt` is declared inside the tool-loop branch at line 369. Any agent with `tool_loop` off will throw `ReferenceError` mid-turn and every reply will fail. Hoist it to the top of `runTurn`.

### 3. Make "I drafted it" impossible when nothing was drafted

Add a completion check to the chat turn: if the final reply claims a deliverable (drafted / created / wrote / sent / attached / "here it is") and zero actions were recorded that turn, do not accept the turn. Feed the model one corrective message — "you described work you never performed; either call `propose_action` or say plainly that you have not done it yet" — and let it use its remaining iterations. If it still ends empty-handed, the reply is saved with an explicit note that nothing was written, rather than a confident lie.

### 4. Show the document in the chat, inline

`AgentDeliverable` already renders a card for an executed `draft_proposal` and can pull the signed PDF. Two gaps to close:

- Open the PDF in an inline viewer inside the chat panel (expandable preview) instead of only a new-tab download.
- Show the proposal's text body in the card as a collapsible section, so she can read it without leaving the thread.

### 5. Give the thread real continuity

Today the replay is plain text plus a bare note like "[1 action proposed]". Improve `describeTurnOutcome` to carry the specifics — action kind, status and the resulting id/name (e.g. "draft_proposal executed → proposal `abc123` on Menovia Social Media"). That is what stops her re-proposing something that already exists, and lets "send me the draft" resolve to a concrete record instead of a fresh invention.

Also raise the replayed window from 24 turns and stop dropping turns whose content is empty but whose actions were real.

### 6. Clean up the poisoned thread

The 06:37 blank assistant row and the failed 04:28 row are still in the history. Backfill them to an explicit "this turn produced nothing" note so the replay is honest, and mark the two orphaned "Drafted" claims so Bria's own history stops telling her the draft exists.

## Technical summary

| File | Change |
| --- | --- |
| deploy | `agent-chat` + `_shared/agents/*` (no code change needed for the loop itself) |
| `supabase/functions/agent-chat/index.ts` | hoist `startedAt`; add the claim-without-action check |
| `supabase/functions/_shared/agents/history.ts` | richer `describeTurnOutcome`, keep action-bearing empty turns |
| `src/components/admin/agent/AgentDeliverable.tsx` | inline PDF preview + collapsible proposal body |
| migration | backfill the blank/failed rows in Bria's thread |

Verification: `npx tsc --noEmit -p tsconfig.app.json`, `npm run test`, then one live message to Bria asking for the Menovia draft — expecting a real `draft_proposal` row and a deliverable card in the thread.
