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
  version: "web_dev-v1",
  tier: "web_dev",
  title: "Web Development Services Agreement",
  effectiveLine: "Effective on the date of Client's signature below.",
  sections: [
    {
      heading: "1. Services — Scope",
      body:
        'Cre8 Visions, LLC ("Service Provider") will design and develop a custom website for the Client using the AI builder workflow. The project includes the following standard deliverables: up to ten (10) pages confirmed prior to development; responsive design optimized for mobile, tablet, and desktop; contact form with email notification to the Client and automatic confirmation to the submitter; SEO foundation (page titles, meta descriptions, and image alt text on all pages); Google Analytics 4 setup under the Client\u2019s own Google account; Google Search Console connection and sitemap submission; custom domain connection and SSL certificate; Open Graph image for social media sharing; privacy policy and terms of use pages; and a 7-day post-launch window for bug fixes and minor corrections.',
    },
    {
      heading: "1.2 What Is Not Included",
      body:
        "The following are explicitly outside the scope of this Agreement and are not included in the project fee: pages beyond ten (10) (available via separate change order); WordPress development (available at a higher rate via separate quote); e-commerce or shopping functionality (available as an add-on); paid advertising setup or management of any kind; ongoing website maintenance (available as a separate retainer); SEO content writing or blog management; third-party tool costs including domain registration, Google Analytics, or any paid integrations (these are the Client\u2019s responsibility); and copywriting unless separately agreed upon in writing.",
    },
    {
      heading: "1.3 Design Process & Change Orders",
      body:
        "Service Provider will deliver two (2) distinct homepage design concepts via the client portal. The Client selects one direction. Two (2) revision rounds are included on the selected direction. Selecting between the two initial concepts does not constitute a revision round. Any work requested outside the scope defined in this Agreement \u2014 including additional pages, new features, or redesigns after approval \u2014 requires a written change order signed by both parties and must be paid before additional work begins.",
    },
    {
      heading: "2. Payment",
      body:
        "The total project fee is Two Thousand Five Hundred Dollars ($2,500.00 USD). Payment is due in full prior to the commencement of any design or development work. No work begins until payment is received and confirmed. By submitting payment, the Client agrees to all terms of this Agreement. Payment is processed via SureCart through the Cre8 Visions website; all major credit and debit cards are accepted. If a payment is disputed or charged back without prior resolution with Service Provider, all work will cease immediately and the Client forfeits any deliverables not yet received. Service Provider reserves the right to pursue collection of any outstanding amounts owed under this Agreement.",
    },
    {
      heading: "3. Client Responsibilities",
      body:
        "The Client is responsible for providing all required content in a timely manner, including: logo in SVG or high-resolution PNG with a transparent background; photography and images at a minimum resolution of 1500 pixels wide in JPG or PNG format; written copy for each page if the Client is providing it; domain registrar login credentials submitted securely via the client portal; and any other brand assets, credentials, or information required to complete the project. Content must be submitted through the client portal by the deadline communicated by Service Provider. If content is not received within fourteen (14) days of a submission request without communication from the Client, Service Provider reserves the right to pause the project or cancel the Agreement under Section 6. The Client agrees to review deliverables and provide feedback or approval within forty-eight (48) hours of delivery unless otherwise communicated; delays in approval shift the project timeline accordingly. The Client is solely responsible for the accuracy, legality, and appropriateness of all content provided.",
    },
    {
      heading: "4. Revisions",
      body:
        "Two (2) revision rounds are included at each deliverable stage \u2014 design and pre-launch review. A revision round means the Client submits all feedback at once and Service Provider addresses everything in a single pass. All revision feedback must be submitted through the client portal using the built-in comment tool. Feedback submitted piecemeal across multiple messages or sessions may be treated as separate revision rounds. Revision requests beyond the two (2) included rounds are available at a rate quoted at the time of the request and must be paid before additional revisions are performed. Design changes requested after a deliverable has been formally approved via the Approve function in the client portal are considered out of scope and require a change order regardless of whether revision rounds have been used.",
    },
    {
      heading: "5. Timeline",
      body:
        "The estimated project duration is four (4) to six (6) weeks from the date work commences, subject to the Client\u2019s timely provision of content, feedback, and approvals. This timeline is an estimate only and is not a guarantee. Service Provider is not responsible for delays resulting from late content submission, delayed approvals, extended revision feedback, or lack of communication from the Client \u2014 the estimated delivery date shifts day for day with any Client-caused delay. Neither party shall be held liable for delays caused by circumstances beyond their reasonable control, including natural disasters, illness, technical outages of third-party platforms, or other unforeseeable events.",
    },
    {
      heading: "6. Cancellation & Kill Fee",
      body:
        "The Client may cancel this Agreement at any time by providing written notice to hello@cre8visions.com. If the Client cancels after work has commenced, a kill fee of Fifty Percent (50%) of the total project fee \u2014 equivalent to One Thousand Two Hundred Fifty Dollars ($1,250.00 USD) \u2014 is retained by Service Provider to compensate for time and resources already invested; any remaining balance will be refunded within fourteen (14) business days. Work is considered commenced upon Service Provider beginning any design, planning, or development activity, including reviewing the discovery questionnaire, creating design concepts, or building any page or feature. If the Client cancels prior to any work commencing, a full refund will be issued within fourteen (14) business days, minus any payment processing fees. Service Provider reserves the right to cancel this Agreement if the Client fails to provide required content within fourteen (14) days of a documented request without communication, engages in abusive or unacceptable conduct, or requests work that violates applicable law or these terms; in such cases, Service Provider will retain compensation for work completed.",
    },
    {
      heading: "7. Intellectual Property",
      body:
        "Upon project completion and full payment, Service Provider transfers ownership of the completed website to the Client. \u201CProject completion\u201D means the delivery of the live website on the Client\u2019s domain and the sending of the final delivery email. The Client receives full ownership of all custom design assets, copy written by Service Provider, and code specific to the Client\u2019s website. Service Provider retains the right to: (a) display the completed project in its portfolio and marketing materials unless the Client requests otherwise in writing; (b) use general knowledge, skills, and techniques acquired during the project in future work for other clients; and (c) retain ownership of any proprietary tools, frameworks, templates, or processes used during development that are not specific to the Client\u2019s project. The Client is responsible for ensuring they have proper licensing for any content they provide.",
    },
    {
      heading: "8. Confidentiality",
      body:
        "Both parties agree to keep confidential any proprietary information shared during the course of the project, including business strategies, credentials, pricing, and processes. Neither party will disclose the other\u2019s confidential information to third parties without written consent, except as required by law. This obligation survives the termination of this Agreement.",
    },
    {
      heading: "9. Limitation of Liability",
      body:
        "To the maximum extent permitted by applicable law, Service Provider\u2019s total liability under this Agreement shall not exceed the total project fee paid by the Client. Service Provider is not liable for: (a) indirect, incidental, or consequential damages; (b) lost revenue, profits, or business opportunities; (c) third-party platform outages, changes, or failures (including Lovable, Google, or any other platform used to build or host the website); or (d) any damages resulting from the Client\u2019s use or misuse of the completed website.",
    },
    {
      heading: "10. Warranties & Representations",
      body:
        "Service Provider represents that it has the right and authority to enter into this Agreement; that the services will be performed in a professional manner consistent with industry standards; and that the completed website will function as described in this Agreement at the time of delivery. The Client represents that they have the right and authority to enter into this Agreement; that all content provided is owned by or properly licensed to the Client; and that the intended use of the website does not violate any applicable law or third-party rights. Service Provider makes no guarantee of specific business outcomes, search engine rankings, traffic levels, or revenue resulting from the completed website.",
    },
    {
      heading: "11. Governing Law & Dispute Resolution",
      body:
        "This Agreement shall be governed by and construed in accordance with the laws of the State of Georgia, without regard to its conflict of law principles. In the event of a dispute, both parties agree to attempt resolution through good-faith negotiation before pursuing any other remedy. If negotiation fails, disputes shall be resolved through binding arbitration in Atlanta, Georgia, in accordance with the rules of the American Arbitration Association. The prevailing party shall be entitled to recover reasonable attorneys\u2019 fees and costs.",
    },
    {
      heading: "12. Entire Agreement & Communication",
      body:
        "This Agreement constitutes the entire agreement between the parties with respect to the subject matter herein and supersedes all prior discussions, representations, or agreements, whether written or oral. This Agreement may only be modified by a written amendment signed by both parties. If any provision is found to be unenforceable, the remaining provisions shall remain in full force and effect. All project-related assets, files, credentials, and feedback must be submitted through the Cre8 Visions client portal. Questions and general inquiries should be directed to hello@cre8visions.com. Service Provider responds to communications within twenty-four (24) hours on business days.",
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
