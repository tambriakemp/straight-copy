// Hook for CRE-286 (SureContact Sales Pipeline sync).
//
// CRE-287 needs "every time a proposal is sent or a new version is sent, the
// SureContact deal amount updates to match" — but CRE-286, which owns the
// actual deal (stage mapping, the deal uuid, the SureContact API calls), has
// not been built yet. Rather than bolt a partial version of that onto this
// proposal-versions change, this is the call site CRE-286 fills in: call it
// from `notify` once a proposal's status flips to 'sent', with the proposal's
// current title and total_cents. Until CRE-286 lands this is a deliberate
// no-op — logged, not silently dropped, so "nothing happened" is visible in
// the function logs rather than looking like a successful sync.
export interface ProposalSentForDealSync {
  proposalId: string;
  clientId: string;
  clientProjectId: string | null;
  title: string;
  totalCents: number | null;
  isNewVersion: boolean;
}

export async function syncProposalToSureContactDeal(input: ProposalSentForDealSync): Promise<void> {
  console.log(
    "[proposal-deal-sync] no-op pending CRE-286 — would sync deal amount:",
    { proposalId: input.proposalId, totalCents: input.totalCents, isNewVersion: input.isNewVersion },
  );
}
