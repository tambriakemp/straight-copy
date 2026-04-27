// Helpers to auto-flip journey checklist items in response to real events
// (email sent, SureContact opened event, etc.). Idempotent — safe to call
// multiple times for the same key/client.
//
// The existing `auto_complete_journey_node` DB trigger handles cascading
// node completion when all items are done, so we only need to mutate the
// checklist JSON here.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type AdminClient = SupabaseClient;

/** Find the active client id for a given recipient email (case-insensitive). */
export async function resolveClientIdByEmail(
  supabase: AdminClient,
  email: string,
): Promise<string | null> {
  if (!email) return null;
  const { data } = await supabase
    .from("clients")
    .select("id")
    .ilike("contact_email", email)
    .eq("archived", false)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Flip a single checklist item to done on a node identified by node key
 * (e.g. "intake"). Idempotent — does nothing if the item is already done
 * or the node/item is not present.
 *
 * Returns true if a write happened, false otherwise.
 */
export async function flipChecklistItem(
  supabase: AdminClient,
  clientId: string,
  nodeKey: string,
  itemKey: string,
): Promise<boolean> {
  const { data: node, error } = await supabase
    .from("journey_nodes")
    .select("id, checklist")
    .eq("client_id", clientId)
    .eq("key", nodeKey)
    .maybeSingle();

  if (error || !node) return false;

  const checklist = Array.isArray(node.checklist) ? (node.checklist as any[]) : [];
  let mutated = false;
  const next = checklist.map((it) => {
    if (it && typeof it === "object" && it.key === itemKey && !it.done) {
      mutated = true;
      return { ...it, done: true };
    }
    return it;
  });

  if (!mutated) return false;

  const { error: updErr } = await supabase
    .from("journey_nodes")
    .update({ checklist: next })
    .eq("id", node.id);

  if (updErr) {
    console.error("[auto-checklist] update failed", { clientId, nodeKey, itemKey, error: updErr });
    return false;
  }
  return true;
}

/**
 * Map of templateName → {nodeKey, itemKey} for emails whose successful
 * enqueue should mark a checklist item done.
 *
 * Add entries here as new templates are scaffolded.
 */
export const TEMPLATE_TO_CHECKLIST: Record<string, { nodeKey: string; itemKey: string }> = {
  // The onboarding-invite IS the welcome email sent after purchase.
  "onboarding-invite": { nodeKey: "intake", itemKey: "intake.welcome_email_sent" },
  // Future:
  // "contract-invitation":   { nodeKey: "intake", itemKey: "intake.contract_sent" },
  // "scope-summary":         { nodeKey: "intake", itemKey: "intake.scope_summary_sent" },
  // "kickoff-confirmation":  { nodeKey: "intake", itemKey: "intake.kickoff_confirmation_sent" },
};

/** Build an admin Supabase client from the standard env vars. */
export function adminClient(): AdminClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}
