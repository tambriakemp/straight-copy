/**
 * Contract templates source of truth.
 *
 * Mirrored at `supabase/functions/_shared/contract-templates.ts` for use in
 * the `contract-sign` edge function (PDF generation). Keep both files in sync
 * when editing.
 *
 * To edit contract content: change the `sections` arrays below. Bump the
 * `version` string when material legal terms change so existing signed
 * contracts remain pinned to the version they signed.
 */

export type ContractSection = { heading: string; body: string };
export type ContractTemplate = {
  version: string;
  tier: "launch" | "growth";
  title: string;
  effectiveLine: string;
  sections: ContractSection[];
};

const COMMON_INTRO = (tierLabel: string) =>
  `This Service Agreement ("Agreement") is entered into between Cre8 Visions, LLC ("Agency", "we", "us") and the undersigned client ("Client", "you") for the ${tierLabel} engagement described below. By signing this Agreement, both parties agree to the following terms.`;

export const LAUNCH_CONTRACT: ContractTemplate = {
  version: "launch-v1",
  tier: "launch",
  title: "Launch Tier Service Agreement",
  effectiveLine: "Effective on the date of Client's signature below.",
  sections: [
    {
      heading: "1. Engagement & Scope",
      body:
        `${COMMON_INTRO("Launch")} The Launch tier delivers the foundational AI Operating System for your brand: brand voice development, foundational asset creation, automation setup for client communications and lead capture, and integration of the core tools required to operate the system. Specific deliverables are governed by the scope summary provided to Client at intake.`,
    },
    {
      heading: "2. Client Responsibilities",
      body:
        "Client agrees to (a) provide timely access to the accounts and platforms required to deliver the engagement, (b) respond to requests for information, review, and approval within five (5) business days, and (c) provide accurate and complete information during onboarding. Delays in Client responsiveness may extend the delivery timeline.",
    },
    {
      heading: "3. Fees & Payment",
      body:
        "Fees for the Launch engagement are as quoted in the Client's purchase order or scope summary and are due in full prior to commencement of work unless otherwise agreed in writing. All fees are non-refundable once work has begun. Late payments accrue interest at 1.5% per month or the maximum rate permitted by law.",
    },
    {
      heading: "4. Deliverables & Acceptance",
      body:
        "Deliverables will be provided through the Client portal as each journey node is completed. Client has five (5) business days from delivery to provide written feedback or revision requests; failure to respond within this period will be treated as acceptance.",
    },
    {
      heading: "5. Intellectual Property",
      body:
        "Upon full payment, Client owns all final deliverables created specifically for Client under this Agreement. Agency retains ownership of its pre-existing tools, templates, frameworks, and methodologies. Agency may reference the engagement in its portfolio and case studies unless Client requests confidentiality in writing.",
    },
    {
      heading: "6. Confidentiality",
      body:
        "Each party agrees to keep confidential any non-public information shared by the other in connection with this Agreement and to use such information solely for the purpose of performing under this Agreement.",
    },
    {
      heading: "7. Term & Termination",
      body:
        "This Agreement remains in effect until all Launch deliverables are complete. Either party may terminate for material breach with fourteen (14) days written notice and an opportunity to cure. Upon termination, Client is responsible for all fees for work performed through the termination date.",
    },
    {
      heading: "8. Limitation of Liability",
      body:
        "Agency's total liability under this Agreement is limited to the fees paid by Client for the engagement. Agency is not liable for indirect, incidental, or consequential damages.",
    },
    {
      heading: "9. Governing Law",
      body:
        "This Agreement is governed by the laws of the State in which Agency is organized, without regard to conflict-of-law principles. Any disputes will be resolved through good-faith negotiation first and binding arbitration if negotiation fails.",
    },
    {
      heading: "10. Entire Agreement",
      body:
        "This Agreement, together with the scope summary provided at intake, constitutes the entire agreement between the parties and supersedes all prior discussions. Amendments must be in writing and signed by both parties.",
    },
  ],
};

export const GROWTH_CONTRACT: ContractTemplate = {
  version: "growth-v1",
  tier: "growth",
  title: "Growth Tier Service Agreement",
  effectiveLine: "Effective on the date of Client's signature below.",
  sections: [
    {
      heading: "1. Engagement & Scope",
      body:
        `${COMMON_INTRO("Growth")} The Growth tier includes everything in the Launch engagement plus an ongoing monthly retainer covering content production, AI avatar management, Business Brain (Claude Pro) maintenance, monthly strategy briefings, and continuous optimization of the AI Operating System. Specific monthly deliverables are governed by the scope summary provided to Client at intake.`,
    },
    {
      heading: "2. Client Responsibilities",
      body:
        "Client agrees to (a) provide timely access to the accounts and platforms required to deliver the engagement, (b) respond to requests for information, review, and approval within five (5) business days, (c) provide accurate and complete information during onboarding, and (d) maintain active subscriptions for the third-party tools required by the Growth tier (including HeyGen and Claude Pro).",
    },
    {
      heading: "3. Fees & Payment",
      body:
        "The Launch foundation fee is due in full prior to commencement of work. The Growth monthly retainer is billed in advance on the first of each month. Either party may end the monthly engagement with thirty (30) days written notice. Monthly fees are non-refundable once the billing cycle has begun. Late payments accrue interest at 1.5% per month or the maximum rate permitted by law.",
    },
    {
      heading: "4. Monthly Deliverables & Acceptance",
      body:
        "Monthly deliverables are provided through the Client portal on a rolling basis. Client has five (5) business days from delivery to provide written feedback or revision requests; failure to respond will be treated as acceptance. Unused monthly deliverables do not roll over to subsequent months.",
    },
    {
      heading: "5. Intellectual Property",
      body:
        "Upon full payment, Client owns all final deliverables created specifically for Client under this Agreement, including monthly content. Agency retains ownership of its pre-existing tools, templates, frameworks, and methodologies, including the Business Brain prompt architecture. Agency may reference the engagement in its portfolio and case studies unless Client requests confidentiality in writing.",
    },
    {
      heading: "6. Confidentiality",
      body:
        "Each party agrees to keep confidential any non-public information shared by the other in connection with this Agreement and to use such information solely for the purpose of performing under this Agreement.",
    },
    {
      heading: "7. Term & Termination",
      body:
        "The initial term of the Growth monthly engagement is three (3) months from the kickoff date. After the initial term, the engagement continues month to month and may be ended by either party with thirty (30) days written notice. Either party may terminate for material breach with fourteen (14) days written notice and an opportunity to cure. Upon termination, Client retains all delivered assets and is responsible for fees for work performed through the termination date.",
    },
    {
      heading: "8. Limitation of Liability",
      body:
        "Agency's total liability under this Agreement is limited to the fees paid by Client in the three (3) months preceding the event giving rise to the claim. Agency is not liable for indirect, incidental, or consequential damages.",
    },
    {
      heading: "9. Governing Law",
      body:
        "This Agreement is governed by the laws of the State in which Agency is organized, without regard to conflict-of-law principles. Any disputes will be resolved through good-faith negotiation first and binding arbitration if negotiation fails.",
    },
    {
      heading: "10. Entire Agreement",
      body:
        "This Agreement, together with the scope summary provided at intake, constitutes the entire agreement between the parties and supersedes all prior discussions. Amendments must be in writing and signed by both parties.",
    },
  ],
};

export function getContractTemplate(tier: string): ContractTemplate {
  return tier === "growth" ? GROWTH_CONTRACT : LAUNCH_CONTRACT;
}
