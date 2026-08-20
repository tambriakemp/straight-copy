// Catching a turn that says it made something when it made nothing.
//
// Bria spent an entire evening telling the owner a proposal had been drafted
// against Menovia. Four different turns said "Drafted", "Proposing it properly
// now" and "Here it is". Not one of them called `propose_action`, and no
// `draft_proposal` row was ever written. The reply reads like completed work,
// so the owner goes looking for a document that does not exist, asks again,
// and the agent re-announces it — which is the loop she described.
//
// The model cannot be trusted to notice this about itself, so the turn is
// checked after the fact: claimed a deliverable, recorded no action, therefore
// the turn is not finished.
//
// Import-free on purpose — the frontend vitest suite reaches this module, and a
// Deno `npm:` specifier does not resolve under the app's tsconfig.

/**
 * Phrases that assert a durable artefact now exists.
 *
 * Deliberately narrow. "I can draft it" and "shall I create one" are offers,
 * not claims, and flagging those would make every planning reply suspect.
 */
const CLAIM_PATTERNS: RegExp[] = [
  /\b(?:i(?:'ve| have)?\s+)?(?:drafted|created|written|wrote|generated|produced|filed|attached|scheduled|queued|sent)\s+(?:it|the|a|an|this|that|your)\b/i,
  /\bit(?:'s| is| has been)\s+(?:drafted|created|written|filed|attached|ready|done|sent)\b/i,
  /\b(?:here it is|here's the draft|here is the draft|here's the proposal|here is the proposal)\b/i,
  /\bproposed\s+(?:as\s+)?a\s+draft\b/i,
  /\b(?:the\s+)?draft\s+(?:is|has been)\s+(?:in|on|against|filed|created|ready)\b/i,
  /\bhas been (?:drafted|created|filed|written|added to the board)\b/i,
];

/** Hedges that mean the sentence is about intent, not accomplishment. */
const HEDGES: RegExp[] = [
  /\bi (?:have not|haven't|did not|didn't) (?:actually )?(?:draft|create|write|file|send)/i,
  /\bnothing (?:was|has been) (?:written|created|drafted|sent)\b/i,
  /\bnot (?:yet )?(?:drafted|created|written|filed)\b/i,
];

/**
 * True when the reply asserts a deliverable exists.
 *
 * The caller pairs this with the turn's real action count: a claim with zero
 * actions is the bug. A claim with actions is just an accurate sentence.
 */
export function claimsUnperformedWork(text: string | null | undefined): boolean {
  const body = (text ?? "").trim();
  if (!body) return false;
  if (HEDGES.some((h) => h.test(body))) return false;
  return CLAIM_PATTERNS.some((p) => p.test(body));
}

/**
 * The message handed back to the model when it claimed work it never did.
 *
 * Written as an instruction rather than a scolding: it has iterations left, and
 * the useful outcome is that it now calls the tool.
 */
export const CLAIM_CORRECTION =
  "Stop. Your reply describes work as done, but no action was recorded this " +
  "turn — nothing was written to the system and the owner will see nothing. " +
  "Either call `propose_action` now to actually create it, or reply saying " +
  "plainly that you have not created it yet and what you need in order to. " +
  "Do not describe a draft that does not exist.";

/** Appended to a reply that still claims work after the correction. */
export const CLAIM_DISCLAIMER =
  "\n\n---\n\n**Nothing was written to the system on this turn** — no document " +
  "or record was created, despite the wording above. Ask again and I will " +
  "create it properly.";
