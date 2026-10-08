// SureContact Sales Pipeline sync (CRE-286).
//
// One deal per client_project — see the migration that added
// client_projects.surecontact_deal_id/surecontact_deal_stage for why. Four
// call sites feed this:
//   - proposal-sign `notify`  -> syncProposalToSureContactDeal (Proposal Sent
//     on the first send, In Negotiation when a revised version goes out).
//   - proposal-sign `sign` (CRE-332 Phase 6.2) -> markDealSignedForProposal.
//   - proposal-sign `void`/`decline` -> markDealLostForProposal.
//   - surecart-webhook (deposit invoice flips to paid) -> markDealWonFromDepositPaid.
//
// Stage mapping the task spec asked for but has no trigger in this codebase
// yet, so they are not wired here: New (prospect approved for outreach / books
// through the site — that's the separate cold-outreach pipeline, not
// client_projects), Qualifying (prospect replies / opens free preview — no
// such event exists), Demo Scheduled (discovery call booked — no booking
// integration exists), and the "client asks for changes" half of In
// Negotiation (only "a revised proposal replaces an older one" is wired, via
// isNewVersion) and the "expired" half of Lost (client_proposals has no
// expired status).
//
// Best-effort throughout, per the task's rule: a SureContact failure must
// never block signing, invoicing, or emails. Every exported function swallows
// its own errors, logs them, and emails info@cre8visions.com once per entity
// per day via alertSyncFailure — it never throws back to its caller.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import {
  addDealNote,
  attachCompanies,
  attachContacts,
  createDeal,
  markDealLost,
  markDealWon,
  moveDealStage,
  reopenDeal,
  stageRank,
  updateDealAmount,
  type StageKey,
} from "./surecontact-deals.ts";

export interface ProposalSentForDealSync {
  proposalId: string;
  clientId: string;
  clientProjectId: string | null;
  title: string;
  totalCents: number | null;
  isNewVersion: boolean;
}

export interface DepositPaidForDealSync {
  proposalId: string;
  clientProjectId: string;
  amountCents: number;
}

export interface ProposalLostForDealSync {
  proposalId: string;
  clientProjectId: string | null;
  reason: string;
}

const money = (cents: number | null | undefined) =>
  cents == null
    ? "an unspecified amount"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

const nowCT = () => new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }) + " CT";

const STAGE_LABEL: Record<StageKey, string> = {
  new: "New",
  qualifying: "Qualifying",
  demoScheduled: "Demo Scheduled",
  proposalSent: "Proposal Sent",
  inNegotiation: "In Negotiation",
  signed: "Signed",
  won: "Won",
  lost: "Lost",
};

/** Emails info@cre8visions.com once per entity per day — a SureContact
 *  outage must be loud, but a burst of retries on the same broken deal
 *  should not flood the inbox. Best-effort: a failure here is logged and
 *  swallowed too, never re-thrown. */
async function alertSyncFailure(
  supabase: SupabaseClient,
  opts: { context: string; detail: string },
): Promise<void> {
  console.error(`[proposal-deal-sync] ${opts.context}: ${opts.detail}`);
  try {
    const day = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "surecontact-sync-failed-admin",
        recipientEmail: "info@cre8visions.com",
        idempotencyKey: `surecontact-sync-failed-${opts.context}-${day}`,
        templateData: { context: opts.context, detail: opts.detail },
      },
    });
    if (error) console.error("[proposal-deal-sync] failure alert send failed:", error);
  } catch (e) {
    console.error("[proposal-deal-sync] failure alert itself threw:", e);
  }
}

async function loadProject(supabase: SupabaseClient, clientProjectId: string) {
  const { data, error } = await supabase
    .from("client_projects")
    .select("id, client_id, name, surecontact_deal_id, surecontact_deal_stage")
    .eq("id", clientProjectId)
    .maybeSingle();
  if (error) throw error;
  return data as {
    id: string;
    client_id: string;
    name: string;
    surecontact_deal_id: string | null;
    surecontact_deal_stage: string | null;
  } | null;
}

async function loadContactAndCompanyUuids(supabase: SupabaseClient, clientId: string) {
  const [{ data: client }, { data: company }] = await Promise.all([
    supabase.from("clients").select("surecontact_contact_uuid").eq("id", clientId).maybeSingle(),
    supabase.from("client_companies").select("surecontact_company_uuid")
      .eq("client_id", clientId).eq("is_primary", true).maybeSingle(),
  ]);
  return {
    contactUuids: client?.surecontact_contact_uuid ? [client.surecontact_contact_uuid as string] : [],
    companyUuids: company?.surecontact_company_uuid ? [company.surecontact_company_uuid as string] : [],
  };
}

/**
 * Proposal Sent (first send) or In Negotiation (a revised version sent).
 * Creates the project's deal on first use, otherwise keeps its amount/title
 * current and moves its stage forward — never backward, per the task's rule —
 * unless the deal was Lost, in which case sending again means the prospect
 * came back, so it reopens instead.
 */
export async function syncProposalToSureContactDeal(
  supabase: SupabaseClient,
  input: ProposalSentForDealSync,
): Promise<void> {
  if (!input.clientProjectId) {
    console.warn("[proposal-deal-sync] proposal has no client_project_id, skipping:", input.proposalId);
    return;
  }
  const targetStage: StageKey = input.isNewVersion ? "inNegotiation" : "proposalSent";

  try {
    const project = await loadProject(supabase, input.clientProjectId);
    if (!project) throw new Error(`client_project ${input.clientProjectId} not found`);

    if (!project.surecontact_deal_id) {
      const { contactUuids, companyUuids } = await loadContactAndCompanyUuids(supabase, input.clientId);
      const dealUuid = await createDeal({
        name: input.title || project.name,
        stageKey: targetStage,
        amountCents: input.totalCents,
        contactUuids,
        companyUuids,
        sourceId: input.proposalId,
      });
      const { error } = await supabase.from("client_projects")
        .update({ surecontact_deal_id: dealUuid, surecontact_deal_stage: targetStage })
        .eq("id", project.id);
      if (error) throw error;
      await addDealNote(
        dealUuid,
        `Proposal "${input.title}" sent (${money(input.totalCents)}) — ${nowCT()}.` +
          (contactUuids.length || companyUuids.length ? "" : " (No SureContact contact/company on file to attach yet.)"),
      );
      return;
    }

    const dealUuid = project.surecontact_deal_id;
    const lastStage = project.surecontact_deal_stage;

    // Amount/title stay current on every send or resend, independent of
    // whether the stage itself moves.
    try {
      await updateDealAmount(dealUuid, input.title, input.totalCents);
    } catch (e) {
      console.error("[proposal-deal-sync] amount update failed (continuing):", e);
    }

    if (lastStage === "won") {
      // A send after Won is unusual (e.g. a follow-on engagement on the same
      // project) — note it, but never touch a Won stage automatically.
      await addDealNote(
        dealUuid,
        `Proposal "${input.title}" sent again (${money(input.totalCents)}) — deal is already Won, stage left unchanged — ${nowCT()}.`,
      );
    } else if (lastStage === "lost") {
      // The one allowed backward move: reopening a lost deal because the
      // proposal it was lost on just came back to life.
      await reopenDeal(dealUuid, targetStage);
      const { error } = await supabase.from("client_projects")
        .update({ surecontact_deal_stage: targetStage }).eq("id", project.id);
      if (error) throw error;
      await addDealNote(
        dealUuid,
        `Proposal "${input.title}" sent again (${money(input.totalCents)}) — reopened from Lost to ${STAGE_LABEL[targetStage]} — ${nowCT()}.`,
      );
    } else {
      const lastRank = lastStage ? stageRank(lastStage) : -1;
      if (stageRank(targetStage) > lastRank) {
        await moveDealStage(dealUuid, targetStage);
        const { error } = await supabase.from("client_projects")
          .update({ surecontact_deal_stage: targetStage }).eq("id", project.id);
        if (error) throw error;
        await addDealNote(
          dealUuid,
          `Proposal "${input.title}" ${input.isNewVersion ? "revised and sent" : "sent"} (${money(input.totalCents)}) — moved to ${STAGE_LABEL[targetStage]} — ${nowCT()}.`,
        );
      } else {
        // Same stage or a would-be backward move (e.g. a plain resend while
        // already In Negotiation) — amount already updated above, just note it.
        await addDealNote(
          dealUuid,
          `Proposal "${input.title}" resent (${money(input.totalCents)}) — ${nowCT()}.`,
        );
      }
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await alertSyncFailure(supabase, { context: `proposal-sent-${input.proposalId}`, detail });
  }
}

export interface ProposalSignedForDealSync {
  proposalId: string;
  clientProjectId: string | null;
}

/**
 * Signed (CRE-332 Phase 6.2): the client has countersigned, before the
 * deposit invoice is necessarily paid — Won stays reserved for the deposit
 * landing (markDealWonFromDepositPaid below), same as it already was.
 * Called from proposal-sign's `sign` action, right after the signature and
 * countersignature are durable.
 */
export async function markDealSignedForProposal(
  supabase: SupabaseClient,
  input: ProposalSignedForDealSync,
): Promise<void> {
  if (!input.clientProjectId) return;
  try {
    const project = await loadProject(supabase, input.clientProjectId);
    if (!project?.surecontact_deal_id) return; // no deal was ever created for this project
    // Idempotent re-fire, and never move backward out of a later stage.
    if (["signed", "won", "lost"].includes(project.surecontact_deal_stage ?? "")) return;

    await moveDealStage(project.surecontact_deal_id, "signed");
    const { error } = await supabase.from("client_projects")
      .update({ surecontact_deal_stage: "signed" }).eq("id", project.id);
    if (error) throw error;
    await addDealNote(project.surecontact_deal_id, `Proposal countersigned — ${nowCT()}.`);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await alertSyncFailure(supabase, { context: `proposal-signed-${input.proposalId}`, detail });
  }
}

/**
 * Won: the proposal is signed and its deposit installment has been paid.
 * Called from surecart-webhook once a project_invoices row with
 * trigger = 'on_signature' flips to paid.
 */
export async function markDealWonFromDepositPaid(
  supabase: SupabaseClient,
  input: DepositPaidForDealSync,
): Promise<void> {
  try {
    const project = await loadProject(supabase, input.clientProjectId);
    if (!project?.surecontact_deal_id) {
      console.warn(
        "[proposal-deal-sync] deposit paid but project has no SureContact deal yet, skipping:",
        input.clientProjectId,
      );
      return;
    }
    if (project.surecontact_deal_stage === "won") return; // idempotent re-fire of the same webhook event

    await markDealWon(project.surecontact_deal_id);
    const { error } = await supabase.from("client_projects")
      .update({ surecontact_deal_stage: "won" }).eq("id", project.id);
    if (error) throw error;
    await addDealNote(
      project.surecontact_deal_id,
      `Signed and deposit paid (${money(input.amountCents)}) — marked Won — ${nowCT()}.`,
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await alertSyncFailure(supabase, { context: `deposit-paid-${input.proposalId}`, detail });
  }
}

/**
 * Lost: the proposal is voided or declined. Called from proposal-sign's
 * `void` and `decline` actions.
 */
export async function markDealLostForProposal(
  supabase: SupabaseClient,
  input: ProposalLostForDealSync,
): Promise<void> {
  if (!input.clientProjectId) return;
  try {
    const project = await loadProject(supabase, input.clientProjectId);
    if (!project?.surecontact_deal_id) return; // no deal was ever created for this project
    if (project.surecontact_deal_stage === "won" || project.surecontact_deal_stage === "lost") return;

    await markDealLost(project.surecontact_deal_id, input.reason);
    const { error } = await supabase.from("client_projects")
      .update({ surecontact_deal_stage: "lost" }).eq("id", project.id);
    if (error) throw error;
    await addDealNote(project.surecontact_deal_id, `${input.reason} — ${nowCT()}.`);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await alertSyncFailure(supabase, { context: `proposal-lost-${input.proposalId}`, detail });
  }
}

// Exported for completeness / future use (e.g. a manual "attach now" admin
// action) — not currently called from either call site above, since the deal
// is attached once at creation time.
export { attachCompanies, attachContacts };
