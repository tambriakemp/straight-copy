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
export type ContractTier = "launch" | "growth" | "web_dev";
export type ContractTemplate = {
  version: string;
  tier: ContractTier;
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
        "Client agrees to (a) provide timely access to the accounts and platforms required to deliver the engagement, (b) respond to requests for information, review, and approval within five (5) business days, (c) provide accurate and complete information during onboarding, and (d) maintain active subscriptions for the third-party tools required by the Growth tier (including Claude Pro).",
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

export const WEB_DEV_CONTRACT: ContractTemplate = {
  version: "web_dev-v2",
  tier: "web_dev",
  title: "Web Development Services Agreement",
  effectiveLine: "Effective on the date of Client's signature below.",
  sections: [
    {
      heading: "Preamble",
      body:
        "This Web Development Services Agreement (\u201CAgreement\u201D) is entered into between Cre8 Visions, LLC (\u201CService Provider\u201D) and the client identified above (\u201CClient\u201D). By signing this Agreement or by submitting payment, the Client agrees to all terms set forth below.",
    },
    {
      heading: "1.1 Scope of Services",
      body:
        "Cre8 Visions will design and develop a custom website for the Client using the AI builder workflow. The project includes the following standard deliverables: up to ten (10) pages as confirmed between both parties prior to development beginning; responsive design optimized for mobile, tablet, and desktop; contact form with email notification to the Client and automatic confirmation to the submitter; SEO foundation \u2014 page titles, meta descriptions, and image alt text on all pages; Google Analytics 4 setup under the Client\u2019s own Google account; Google Search Console connection and sitemap submission; custom domain connection and SSL certificate; Open Graph image for social media sharing; privacy policy and terms of use pages; and a 7-day post-launch window for bug fixes and minor corrections.",
    },
    {
      heading: "1.2 What Is Not Included",
      body:
        "The following are explicitly outside the scope of this Agreement and are not included in the project fee: pages beyond ten (10) \u2014 available via separate change order; WordPress development \u2014 available at a higher rate via separate quote; e-commerce or shopping functionality \u2014 available as an add-on; paid advertising setup or management of any kind; ongoing website maintenance \u2014 available as a separate retainer; SEO content writing or blog management; third-party tool costs including domain registration, Google Analytics, or any paid integrations \u2014 these are the Client\u2019s responsibility; and copywriting \u2014 unless separately agreed upon in writing.",
    },
    {
      heading: "1.3 Design Process",
      body:
        "Cre8 Visions will deliver two (2) distinct homepage design concepts for the Client\u2019s review via the client portal. The Client selects one direction. Two (2) revision rounds are included on the selected direction. Selecting between the two initial concepts does not constitute a revision round.",
    },
    {
      heading: "1.4 Change Orders",
      body:
        "Any work requested outside the scope defined in this Agreement \u2014 including additional pages, new features, or redesigns after approval \u2014 requires a written change order signed by both parties. Change orders are quoted separately and must be paid before the additional work begins.",
    },
    {
      heading: "2.1 Project Fee",
      body: "The total project fee is Two Thousand Five Hundred Dollars ($2,500.00 USD).",
    },
    {
      heading: "2.2 Payment Terms",
      body:
        "Payment is due in full prior to the commencement of any design or development work. No work begins until payment is received and confirmed. By submitting payment, the Client agrees to all terms of this Agreement.",
    },
    {
      heading: "2.3 Accepted Payment Methods",
      body:
        "Payment is processed via SureCart through the Cre8 Visions website. All major credit and debit cards are accepted.",
    },
    {
      heading: "2.4 Late or Disputed Payments",
      body:
        "All payments are due in full at the time of purchase. If a payment is disputed or charged back without prior resolution with Cre8 Visions, all work will cease immediately and the Client forfeits any deliverables not yet received. Cre8 Visions reserves the right to pursue collection of any outstanding amounts owed under this Agreement.",
    },
    {
      heading: "3.1 Content Submission",
      body:
        "The Client is responsible for providing all required content in a timely manner, including but not limited to: logo file in SVG or high-resolution PNG format with a transparent background; photography and images at a minimum resolution of 1500 pixels wide in JPG or PNG format; written copy for each page, if the Client is providing it; domain registrar login credentials submitted securely via the client portal; and any other brand assets, credentials, or information required to complete the project.",
    },
    {
      heading: "3.2 Content Submission Deadline",
      body:
        "Content must be submitted through the client portal by the deadline communicated by Cre8 Visions during the project. Delays in content submission directly affect the project timeline. If content is not received within fourteen (14) days of the submission request without communication from the Client, Cre8 Visions reserves the right to pause the project or cancel the Agreement under Section 6.",
    },
    {
      heading: "3.3 Timely Review and Approvals",
      body:
        "The Client agrees to review deliverables and provide feedback or approval within forty-eight (48) hours of delivery unless otherwise communicated. Delays in approval shift the project timeline accordingly. Cre8 Visions is not responsible for timeline delays caused by the Client\u2019s failure to provide timely responses, content, or approvals.",
    },
    {
      heading: "3.4 Accuracy of Content",
      body:
        "The Client is solely responsible for the accuracy, legality, and appropriateness of all content provided. Cre8 Visions is not liable for errors, omissions, or legal issues arising from Client-provided content.",
    },
    {
      heading: "4.1 Included Revisions",
      body:
        "Two (2) revision rounds are included at each deliverable stage \u2014 design and pre-launch review. A revision round means the Client submits all feedback at once and Cre8 Visions addresses everything in a single pass.",
    },
    {
      heading: "4.2 Revision Submission",
      body:
        "All revision feedback must be submitted through the client portal using the built-in comment tool. Feedback submitted piecemeal across multiple messages or sessions may be treated as separate revision rounds. The Client is encouraged to review all deliverables thoroughly before submitting feedback.",
    },
    {
      heading: "4.3 Additional Revisions",
      body:
        "Revision requests beyond the two (2) included rounds are available at a rate to be quoted by Cre8 Visions at the time of the request and must be paid before the additional revisions are performed.",
    },
    {
      heading: "4.4 Out-of-Scope Changes",
      body:
        "Design changes requested after a deliverable has been formally approved by the Client \u2014 via the Approve function in the client portal \u2014 are considered out of scope and require a change order regardless of whether revision rounds have been used.",
    },
    {
      heading: "5.1 Estimated Timeline",
      body:
        "The estimated project duration is four (4) to six (6) weeks from the date work commences, subject to the Client\u2019s timely provision of content, feedback, and approvals. This timeline is an estimate only and is not a guarantee.",
    },
    {
      heading: "5.2 Client-Caused Delays",
      body:
        "Cre8 Visions is not responsible for timeline delays resulting from late content submission, delayed approvals, extended revision feedback, or lack of communication from the Client. The estimated delivery date shifts day for day with any Client-caused delay.",
    },
    {
      heading: "5.3 Force Majeure",
      body:
        "Neither party shall be held liable for delays caused by circumstances beyond their reasonable control, including but not limited to natural disasters, illness, technical outages of third-party platforms, or other unforeseeable events. Cre8 Visions will communicate any such delays promptly.",
    },
    {
      heading: "6.1 Cancellation by the Client",
      body:
        "The Client may cancel this Agreement at any time by providing written notice to Cre8 Visions at hello@cre8visions.com. Because payment is collected in full prior to work beginning, the following cancellation terms apply.",
    },
    {
      heading: "6.2 Kill Fee",
      body:
        "If the Client cancels this Agreement after work has commenced, a kill fee of Fifty Percent (50%) of the total project fee \u2014 equivalent to One Thousand Two Hundred Fifty Dollars ($1,250.00 USD) \u2014 is retained by Cre8 Visions to compensate for time and resources already invested. The remaining balance, if applicable, will be refunded within fourteen (14) business days of cancellation. Work is considered commenced upon Cre8 Visions beginning any design, planning, or development activity related to the Client\u2019s project, including but not limited to reviewing the discovery questionnaire, creating design concepts, or building any page or feature.",
    },
    {
      heading: "6.3 Refund for No Work Commenced",
      body:
        "If the Client cancels prior to any work commencing \u2014 meaning before Cre8 Visions has reviewed the discovery questionnaire or begun any design activity \u2014 a full refund will be issued within fourteen (14) business days, minus any payment processing fees.",
    },
    {
      heading: "6.4 Cancellation by Cre8 Visions",
      body:
        "Cre8 Visions reserves the right to cancel this Agreement if: (a) the Client fails to provide required content within fourteen (14) days of a documented request without communication; (b) the Client engages in abusive, threatening, or otherwise unacceptable conduct toward Cre8 Visions; or (c) the Client requests work that violates applicable law or these terms. In such cases, Cre8 Visions will retain compensation for work completed and refund any remaining balance within fourteen (14) business days.",
    },
    {
      heading: "7.1 Transfer of Ownership",
      body:
        "Upon project completion and full payment, Cre8 Visions transfers ownership of the completed website to the Client. \u201CProject completion\u201D means the delivery of the live website on the Client\u2019s domain and the sending of the final delivery email. The Client receives full ownership of all custom design assets, copy written by Cre8 Visions, and code specific to the Client\u2019s website.",
    },
    {
      heading: "7.2 Retained Rights",
      body:
        "Cre8 Visions retains the right to: (a) display the completed project in its portfolio and marketing materials unless the Client requests otherwise in writing; (b) use general knowledge, skills, and techniques acquired during the project in future work for other clients; and (c) retain ownership of any proprietary tools, frameworks, templates, or processes used during development that are not specific to the Client\u2019s project.",
    },
    {
      heading: "7.3 Third-Party Assets",
      body:
        "The Client is responsible for ensuring they have proper licensing for any content they provide, including images, fonts, copy, and other assets. Cre8 Visions is not liable for intellectual property violations arising from Client-provided content. Any stock photography or licensed assets sourced by Cre8 Visions on the Client\u2019s behalf will be disclosed, and the cost of licensing is the Client\u2019s responsibility unless otherwise agreed.",
    },
    {
      heading: "8. Confidentiality",
      body:
        "Both parties agree to keep confidential any proprietary information shared during the course of the project, including but not limited to business strategies, credentials, pricing, and processes. Neither party will disclose the other\u2019s confidential information to third parties without written consent, except as required by law. This obligation survives the termination of this Agreement.",
    },
    {
      heading: "9. Limitation of Liability",
      body:
        "To the maximum extent permitted by applicable law, Cre8 Visions\u2019s total liability under this Agreement shall not exceed the total project fee paid by the Client. Cre8 Visions is not liable for: (a) indirect, incidental, or consequential damages; (b) lost revenue, profits, or business opportunities; (c) third-party platform outages, changes, or failures (including Lovable, Google, or any other platform used to build or host the website); or (d) any damages resulting from the Client\u2019s use or misuse of the completed website.",
    },
    {
      heading: "10.1 Warranties by Cre8 Visions",
      body:
        "Cre8 Visions represents that: (a) it has the right and authority to enter into this Agreement; (b) the services will be performed in a professional manner consistent with industry standards; and (c) the completed website will function as described in this Agreement at the time of delivery.",
    },
    {
      heading: "10.2 Warranties by the Client",
      body:
        "The Client represents that: (a) they have the right and authority to enter into this Agreement; (b) all content provided is owned by or properly licensed to the Client; and (c) the intended use of the website does not violate any applicable law or third-party rights.",
    },
    {
      heading: "10.3 No Guarantee of Results",
      body:
        "Cre8 Visions makes no guarantee of specific business outcomes, search engine rankings, traffic levels, or revenue resulting from the completed website. Website performance depends on factors outside Cre8 Visions\u2019s control, including the Client\u2019s marketing efforts, market conditions, and third-party algorithm changes.",
    },
    {
      heading: "11. Governing Law and Dispute Resolution",
      body:
        "This Agreement shall be governed by and construed in accordance with the laws of the State of Georgia, without regard to its conflict of law principles. In the event of a dispute, both parties agree to attempt resolution through good-faith negotiation before pursuing any other remedy. If negotiation fails, disputes shall be resolved through binding arbitration in Atlanta, Georgia, in accordance with the rules of the American Arbitration Association. The prevailing party shall be entitled to recover reasonable attorneys\u2019 fees and costs.",
    },
    {
      heading: "12. Entire Agreement",
      body:
        "This Agreement constitutes the entire agreement between the parties with respect to the subject matter herein and supersedes all prior discussions, representations, or agreements, whether written or oral. This Agreement may only be modified by a written amendment signed by both parties. If any provision of this Agreement is found to be unenforceable, the remaining provisions shall remain in full force and effect.",
    },
    {
      heading: "13. Communication",
      body:
        "All project-related assets, files, credentials, and feedback must be submitted through the Cre8 Visions client portal. Questions and general inquiries should be directed to hello@cre8visions.com. Cre8 Visions responds to communications within twenty-four (24) hours on business days (Monday through Friday, excluding holidays). Project updates are communicated via the client portal and email.",
    },
    {
      heading: "14. Signatures",
      body:
        "By signing below, both parties acknowledge that they have read, understood, and agree to all terms of this Web Development Services Agreement.",
    },
  ],
};


export function getContractTemplate(
  tier: string,
  projectType?: string | null,
): ContractTemplate {
  if (projectType === "web_development") return WEB_DEV_CONTRACT;
  if (tier === "web_dev") return WEB_DEV_CONTRACT;
  return tier === "growth" ? GROWTH_CONTRACT : LAUNCH_CONTRACT;
}
