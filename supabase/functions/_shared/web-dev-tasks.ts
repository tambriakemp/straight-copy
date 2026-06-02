// Auto-generated from Cre8 Visions Web Dev Workflow doc. 7 epics, 50 tasks.
// Used by surecart-webhook (auto on new web_development project) and the
// admin "Seed Web Dev tasks" button in project-tasks.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

export const WEB_DEV_EPICS = [
  { key: "intake",    name: "Phase 01 — Intake & Kickoff",       color: "#39a0a7" },
  { key: "discovery", name: "Phase 02 — Discovery & Planning",   color: "#ff47f9" },
  { key: "design",    name: "Phase 03 — Design",                 color: "#472f9d" },
  { key: "dev",       name: "Phase 04 — Development",            color: "#d45916" },
  { key: "qa",        name: "Phase 05 — QA & Pre-Launch",        color: "#808080" },
  { key: "launch",    name: "Phase 06 — Launch",                 color: "#00b859" },
  { key: "handoff",   name: "Phase 07 — Handoff & Closure",      color: "#9e7133" },
] as const;

// Task numbers that the contract-sign flow must auto-complete the moment
// the client signs the Web Development Services Agreement in the portal.
// Keep in sync with WEB_DEV_TASKS — 1.2 (Contract sent) and 1.3 (Contract
// countersigned by agency).
export const WEB_DEV_CONTRACT_AUTO_COMPLETE_NUMS = ["1.2", "1.3"] as const;

export type WebDevAssignee = "auto" | "admin" | "client";

export interface WebDevTaskDef {
  epic: string;
  num: string;
  name: string;
  assignee_kind: WebDevAssignee;
  description: string;
  acceptance_criteria: string[];
  email_template_key?: string;
  email_trigger?: "agency" | "auto";
}

export const WEB_DEV_TASKS: WebDevTaskDef[] = [
  {
    "epic": "intake",
    "num": "1.1",
    "name": "Purchase confirmed and project created in portal",
    "assignee_kind": "auto",
    "description": "When a client purchases a web development service via SureCart, the system automatically creates a project record in the Cre8 Visions client portal, assigns the correct task template, enrolls the client in the SureContact welcome sequence, and notifies the agency. No manual action is required to initiate the project.\n\n**Instructions**\n- SureCart webhook fires on successful payment\n- Supabase Edge Function creates client record and project in portal\n- Web dev task template assigned to the project automatically\n- SureContact kickoff email enrolled — fires immediately with contract link, discovery questionnaire instructions, and full package scope\n- Agency receives consolidated notification that a new project has started\n\n_Owner: System · Trigger: SureCart purchase webhook · Timing: Immediate on purchase_",
    "acceptance_criteria": [
      "Client record exists in Supabase with correct tier and project type",
      "Portal project visible and accessible to client",
      "Welcome email confirmed delivered via SureContact activity log",
      "Agency notification received"
    ],
    "order_index": 1
  },
  {
    "epic": "intake",
    "num": "1.2",
    "name": "Contract sent to client for signature",
    "assignee_kind": "auto",
    "description": "Immediately after the portal project is created, the system fires the contract to the client via DocuSign or HelloSign. The contract link is also stored in the client's SureContact custom field and populated in the scope summary email. The client receives the contract within minutes of purchase.\n\n**Instructions**\n- Contract template pre-populated with client name, project scope, and payment schedule pulled from SureCart purchase data\n- DocuSign or HelloSign API sends the contract to the client's email address\n- Contract URL stored in clients.contract_url in Supabase\n- Kickoff email includes the contract link via {{contact.custom.contract_url}} — the contract covers full scope, features, revision policy, payment schedule, and timeline\n\n_Owner: System · Trigger: Portal project creation · Timing: Within 5 min of purchase_",
    "acceptance_criteria": [
      "Client receives contract email within 5 minutes of purchase",
      "Contract pre-filled with correct client name and scope",
      "Contract URL saved to client record in Supabase"
    ],
    "order_index": 2
  },
  {
    "epic": "intake",
    "num": "1.3",
    "name": "Contract countersigned by agency",
    "assignee_kind": "auto",
    "description": "When the client signs the Web Development Services Agreement in the portal, Cre8 Visions is auto-countersigned on the same record and a fully executed PDF is generated and stored. No manual action is required — this task is closed automatically by the contract-sign function.\n\n**Instructions**\n- Client signs in the portal (typed or drawn)\n- contract-sign records the signature, stamps agency_countersigned_at, renders the PDF, and stores it under client-assets/contracts/\n- This task and task 1.2 are marked complete automatically\n- web-dev-contract-signed SureContact template is fired to the client\n\n_Owner: System · Trigger: Client signature in portal · Timing: Immediate_",
    "acceptance_criteria": [
      "Contract is fully executed — client signature + auto-countersignature on file",
      "Signed PDF stored in client-assets/contracts/{client_id}/{contract_id}.pdf",
      "client_contracts row linked to the web_development project",
      "Contract-signed email confirmed in SureContact activity log"
    ],
    "order_index": 3,
    "email_template_key": "web-dev-contract-signed",
    "email_trigger": "auto"
  },
  {
    "epic": "intake",
    "num": "1.4",
    "name": "Creative discovery questionnaire completed by client",
    "assignee_kind": "client",
    "description": "The creative discovery questionnaire is the most important input for the entire project. It gives the agency everything needed to understand the client's brand, goals, audience, competitors, and visual preferences before a single design decision is made. The portal activates the questionnaire automatically when the client's contract is signed. A SureContact notification prompts the client to complete it.\n\n_Owner: Client · Trigger: Contract signed → portal activates questionnaire · Timing: Client completes within 48 hours_",
    "acceptance_criteria": [
      "All required fields completed with substantive answers — not one-word responses",
      "At least 3 competitor and 3 inspiration sites provided with notes",
      "Pages list complete and agreed upon",
      "Content status clear — what is ready, what is pending",
      "Questionnaire submission triggers agency notification"
    ],
    "order_index": 4
  },
  {
    "epic": "intake",
    "num": "1.5",
    "name": "Deposit confirmed before work begins",
    "assignee_kind": "auto",
    "description": "The portal automatically verifies that the deposit payment was received via SureCart before unlocking Phase 3. This is a financial gate — design work does not begin until payment is confirmed. The contract the client signed serves as the full scope agreement — it covers what is included, what is not, the revision policy, the payment schedule, and the timeline. No separate SOW is needed. The system checks the SureCart payment record and updates the project status accordingly.\n\n_Owner: System · Trigger: SureCart payment confirmation_",
    "acceptance_criteria": [
      "SureCart payment record shows deposit as successful",
      "Portal unlocks Phase 3 (Design) automatically",
      "If payment fails — client notified automatically, work paused"
    ],
    "order_index": 5
  },
  {
    "epic": "intake",
    "num": "1.6",
    "name": "Kickoff email sent to client",
    "assignee_kind": "admin",
    "description": "Once the contract is countersigned, discovery questionnaire is complete, and deposit is confirmed — send the kickoff email via SureContact. This is the Web Dev — Kickoff template and it covers everything: contract signing instructions, discovery questionnaire instructions, the full package scope (what is included and what is not), the timeline, the revision policy, and how to communicate. The contract and kickoff email together replace any need for a separate SOW.\n\n**Instructions**\n- Confirm all intake gates are complete — contract countersigned, questionnaire submitted, deposit confirmed\n- Send the Web Dev — Kickoff email via SureContact — UUID aa81debf-6a31-422c-aaf1-2a814a56c665\n- Mark this task complete — Phase 2 unlocks\n\n_Owner: Agency · Timing: After all Phase 1 gates complete_",
    "acceptance_criteria": [
      "Contract countersigned, questionnaire complete, and deposit confirmed before sending",
      "Kickoff email delivered — confirmed in SureContact activity log",
      "Phase 2 tasks unlocked in portal"
    ],
    "order_index": 6,
    "email_template_key": "web-dev-kickoff",
    "email_trigger": "agency"
  },
  {
    "epic": "discovery",
    "num": "2.1",
    "name": "Discovery questionnaire responses reviewed and summarized",
    "assignee_kind": "admin",
    "description": "Before any planning or design begins, read through the entire discovery questionnaire thoroughly. The goal is to deeply understand the client's business, their audience, and what success looks like for this project. Create a brief internal project brief summarizing the key insights — this becomes the reference document for all design and development decisions.\n\n**Instructions**\n- Read every questionnaire response in full — do not skim\n- Review all inspiration and competitor sites linked by the client\n- Note any conflicting information or gaps that need clarification\n- Write a 1-page internal project brief covering: business overview, primary goal, target audience, visual direction, pages confirmed, features confirmed, content status\n- Flag any open questions and send them to the client via portal message before proceeding\n- Save the project brief as an internal note in the portal\n\n_Owner: Agency · Timing: Within 24 hours of questionnaire submission_",
    "acceptance_criteria": [
      "All inspiration and competitor sites reviewed",
      "Internal project brief written and saved to portal",
      "Any gaps or conflicts identified and sent to client for clarification",
      "Clear understanding of visual direction before proceeding to sitemap"
    ],
    "order_index": 7,
    "email_template_key": "web-dev-questionnaire-complete",
    "email_trigger": "auto"
  },
  {
    "epic": "discovery",
    "num": "2.2",
    "name": "Sitemap drafted and confirmed with client",
    "assignee_kind": "admin",
    "description": "The sitemap defines the structure of the website — every page, its name, and how pages relate to each other. The contract already defines the package (up to 10 pages) and the kickoff email sets scope expectations — the sitemap is simply the specific list of which pages the client actually wants within that scope. Confirm this before any design work begins because adding or removing pages after design is started costs revision rounds.\n\n**Instructions**\n- List every page in the website by name based on the contract package and questionnaire responses\n- Identify primary navigation pages vs secondary pages (e.g., blog posts, policy pages)\n- Note any pages that are out of scope but might be requested — address now to prevent later confusion\n- Share the sitemap with the client via portal for confirmation — a simple bulleted list is fine\n- Get explicit written confirmation from the client that the page list is correct before proceeding\n\n_Owner: Agency then Client · Timing: Completed before design begins_",
    "acceptance_criteria": [
      "All pages in scope are listed by name",
      "Client has confirmed the page list in writing via portal",
      "No ambiguity about what is in scope and what is not"
    ],
    "order_index": 8
  },
  {
    "epic": "discovery",
    "num": "2.3",
    "name": "Content requirements identified",
    "assignee_kind": "admin",
    "description": "Every page needs content — copy, images, logos, and any other media. Before the design phase, create a clear content inventory that identifies exactly what content the client is providing and what content the agency needs to create, source, or write. This prevents the project from stalling mid-development because a critical asset is missing.\n\n**Instructions**\n- List every content item needed for every page — headlines, body copy, images, CTAs, logos, icons\n- Mark each item as Client Provides or Agency Creates\n- For images the client provides — specify format, minimum resolution, and quantity needed\n- For copy the agency writes — note which pages and confirm the client will review and approve before it goes live\n- For images the agency sources — confirm the client agrees to stock photography or AI-generated images\n- Share the content list with the client and get confirmation\n\n_Owner: Agency · Timing: Alongside sitemap confirmation_",
    "acceptance_criteria": [
      "Every content item for every page identified",
      "Clear designation of who provides what",
      "Client has confirmed the content plan",
      "No surprises about content gaps during development"
    ],
    "order_index": 9
  },
  {
    "epic": "discovery",
    "num": "2.4",
    "name": "Content request sent to client via portal",
    "assignee_kind": "admin",
    "description": "Once the content inventory is confirmed, formally request all client-provided content via the portal. Give the client a clear, organized list of exactly what they need to submit, in what format, and by what date. Content delays are the most common reason web projects miss their deadlines — get this request out early and follow up if needed.\n\n**Instructions**\n- Create an organized content submission checklist in the portal — one item per content piece\n- Specify file format requirements for each item (logo: SVG or PNG with transparent background; photos: minimum 1500px wide, JPG or PNG)\n- Set a content submission deadline — typically 3–5 business days before development begins\n- Inform the client that missing content at the deadline may shift the delivery date\n- Send a portal notification to the client with the content request\n\n_Owner: Agency sends, Client submits · Timing: Immediately after content plan confirmed_",
    "acceptance_criteria": [
      "Content checklist created in portal with all required items listed",
      "File format requirements specified for each item",
      "Content submission deadline communicated to client",
      "Client has acknowledged the request"
    ],
    "order_index": 10
  },
  {
    "epic": "discovery",
    "num": "2.5",
    "name": "All client content received and organized",
    "assignee_kind": "admin",
    "description": "Before development begins, all client-provided content must be received, reviewed for quality, and organized by page. Substandard content — blurry images, incomplete copy, missing logos — caught now is far better than caught during development. If content is missing or unusable, follow up with the client immediately.\n\n**Instructions**\n- Download all submitted content from the portal\n- Check every image for minimum resolution and quality — flag any that are too small or low quality\n- Check the logo — must be SVG or high-resolution PNG with transparent background\n- Review any copy the client provided — check for completeness and flag gaps\n- Organize content into folders by page name\n- Notify the client of any missing or unusable items and set a revised submission deadline\n- Mark this task complete only when all required content is received and usable\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "All client-provided content received",
      "All images meet minimum resolution requirements",
      "Logo is in correct format with transparent background",
      "Content organized by page and ready for development",
      "No content gaps that would block development"
    ],
    "order_index": 11
  },
  {
    "epic": "discovery",
    "num": "2.6",
    "name": "SEO keyword targets identified — one primary per page",
    "assignee_kind": "admin",
    "description": "Each page needs a primary SEO keyword target before copy and titles are written. Choosing the right keyword early means the page title, meta description, headline, and body copy can all be written with that keyword in mind — rather than retrofitting SEO after the fact. Use common sense and basic keyword research — this does not need to be a deep SEO audit.\n\n**Instructions**\n- For each page in the sitemap, identify the primary thing a potential customer would search for to find that page\n- Use Google Search suggestions, client's own language from the questionnaire, and competitor page titles as reference\n- Choose keywords that are specific enough to rank for — \"Atlanta wellness coach\" is better than \"wellness\" or \"Atlanta coach\"\n- Document one primary keyword per page in the project brief\n- Note the keywords to the client so they understand the SEO intent for each page\n\n_Owner: Agency · Timing: Before titles and meta descriptions are written_",
    "acceptance_criteria": [
      "One primary keyword identified for every page in scope",
      "Keywords are specific and realistic for the client's market and location",
      "Keywords documented in project brief"
    ],
    "order_index": 12
  },
  {
    "epic": "discovery",
    "num": "2.7",
    "name": "Page titles and meta descriptions drafted",
    "assignee_kind": "admin",
    "description": "Write the SEO title and meta description for every page before development begins. These are what appear in Google search results and in the browser tab — they are often the first impression a potential customer has of the business. Writing them before development means they can be implemented directly in Lovable rather than added after as an afterthought.\n\n**Instructions**\n- For each page write a title tag — maximum 60 characters, includes the primary keyword and the business name\n- Format: Primary Keyword | Business Name (e.g., \"Holistic Wellness Coaching Atlanta | Bree Wellness\")\n- For each page write a meta description — maximum 155 characters, includes the keyword, a benefit, and a soft CTA\n- Save all titles and meta descriptions in a document organized by page name\n- These will be implemented directly in Lovable during development\n\n_Owner: Agency · Timing: Before development begins_",
    "acceptance_criteria": [
      "Title tag written for every page — under 60 characters",
      "Meta description written for every page — under 155 characters",
      "Primary keyword included in every title and description",
      "All titles and descriptions saved and organized by page"
    ],
    "order_index": 13
  },
  {
    "epic": "design",
    "num": "3.1",
    "name": "Mockup 1 designed in Claude Artifacts",
    "assignee_kind": "admin",
    "description": "Design the first full homepage mockup using Claude Artifacts. This mockup should represent one complete visual direction — a fully committed aesthetic based on one interpretation of the client's questionnaire responses. Do not design a compromise — design a clear point of view. The client will choose between two distinct directions, so both mockups must feel intentional and different from each other.\n\n**Instructions**\n- Open Claude and design the homepage in Artifacts using HTML and CSS\n- Pull the client's brand colors, preferred fonts, and visual direction from the project brief\n- Design the full homepage — hero section, navigation, key sections, and footer — not just a header\n- Use placeholder text for copy but real structural content (real service names, real CTAs pulled from the questionnaire)\n- Use placeholder images in the correct aspect ratios to show the intended layout\n- This mockup should be production-quality — not a rough sketch\n- Export the HTML file and save to the project folder\n\n_Owner: Agency · Timing: After content and sitemap confirmed_",
    "acceptance_criteria": [
      "Full homepage designed — hero through footer",
      "Brand colors and font preferences from questionnaire applied",
      "Real structural content used — not all lorem ipsum",
      "Distinct visual direction — not a generic template",
      "HTML file exported and saved"
    ],
    "order_index": 14
  },
  {
    "epic": "design",
    "num": "3.2",
    "name": "Mockup 2 designed in Claude Artifacts",
    "assignee_kind": "admin",
    "description": "Design the second homepage mockup as a distinctly different visual direction from Mockup 1. The two mockups should not look like variations of the same thing — they should feel like two genuinely different design decisions that both meet the brief. The client picks one direction to develop. If both mockups look similar, the choice is meaningless and the client will ask for a third option.\n\n**Instructions**\n- Design a second homepage in Claude Artifacts with a different layout, typography, or color treatment than Mockup 1\n- If Mockup 1 is dark — Mockup 2 should be light, or vice versa\n- If Mockup 1 uses serif typography — Mockup 2 should use sans-serif, or vice versa\n- The structural content (service names, CTAs) should be the same — only the visual design differs\n- Both mockups must be high quality — the client should genuinely find the choice difficult\n- Export the HTML file and save to the project folder\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "Second mockup is visually distinct from Mockup 1",
      "Both mockups are equal quality — neither is clearly the \"bad\" option",
      "Same structural content used across both mockups",
      "HTML file exported and saved"
    ],
    "order_index": 15
  },
  {
    "epic": "design",
    "num": "3.3",
    "name": "Both mockups uploaded to client portal",
    "assignee_kind": "admin",
    "description": "Upload both mockup HTML files to the Cre8 Visions client portal so the client can preview them via the built-in preview system. The client clicks View to open the live preview, uses the Leave Feedback button to pin comments directly on the design, and clicks Approve on their chosen direction. The portal handles all of this natively — no external sharing links needed.\n\n**Instructions**\n- Upload Mockup 1 HTML file to the portal project under the Design Preview section\n- Upload Mockup 2 HTML file to the same section\n- Label them clearly — Direction A and Direction B, or Option 1 and Option 2\n- Do not label one as recommended or preferred — let the designs speak for themselves\n- Verify both previews render correctly in the portal before notifying the client\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "Both mockups uploaded and labeled in portal",
      "Both previews render correctly — no broken layout or missing styles",
      "Client can access both previews via View button",
      "Leave Feedback button visible in preview for both mockups"
    ],
    "order_index": 16
  },
  {
    "epic": "design",
    "num": "3.4",
    "name": "Design preview email sent to client",
    "assignee_kind": "admin",
    "description": "Once both mockups are uploaded to the portal, send the Design Preview email via SureContact. This email directs the client to the portal, explains exactly how to view the designs and leave feedback using the built-in comment tool, and reminds them of the 2-round revision policy. The email fires via the agency-triggered Design Preview template — UUID 6172a2ae in SureContact Cre8 Visions.\n\n**Instructions**\n- Confirm both mockups are uploaded and rendering correctly before sending\n- Click Send Design Preview Email in the portal dashboard\n- SureContact fires the Design Preview template to the client using their portal_url custom field\n- Confirm delivery in SureContact activity log\n- Set a review deadline — typically 48–72 hours from send\n\n_Owner: Agency triggers_",
    "acceptance_criteria": [
      "Email delivered — confirmed in SureContact activity log",
      "Client portal URL resolves correctly in the email",
      "Review deadline communicated to client"
    ],
    "order_index": 17,
    "email_template_key": "web-dev-design-concepts-ready",
    "email_trigger": "agency"
  },
  {
    "epic": "design",
    "num": "3.5",
    "name": "Client reviews mockups and leaves feedback via portal",
    "assignee_kind": "client",
    "description": "The client opens the portal, views both design previews, and uses the Leave Feedback comment tool to pin specific notes directly on the designs. They should look at both mockups before leaving feedback on either. The goal of this review is to choose a direction AND provide any specific notes on what they want adjusted in that direction.\n\n_Owner: Client · Timing: Within 48–72 hours of preview email_",
    "acceptance_criteria": [
      "Client has reviewed both mockups",
      "Client has left feedback via the portal comment tool",
      "Client has clicked Approve on their chosen direction",
      "Agency has been notified of the selection"
    ],
    "order_index": 18
  },
  {
    "epic": "design",
    "num": "3.6",
    "name": "Client selects preferred direction — one mockup approved",
    "assignee_kind": "admin",
    "description": "The client uses the Approve button in the portal to select their preferred design direction. This is a formal action — once a direction is approved, revisions apply to that direction only. The rejected mockup is archived. If the client cannot decide between the two options, the agency can offer a brief consultation call to help them choose — this is not a revision round.\n\n**Instructions**\n- Client clicks Approve on their chosen mockup in the portal\n- Agency receives portal notification of the selection\n- Agency confirms the selection with the client in a brief portal message\n- Archive the rejected mockup — it is not developed\n- Begin incorporating the client's feedback notes into the approved direction\n- Note: choosing between two options is not a revision round — this is the selection process\n\n_Owner: Client selects, Agency confirms_",
    "acceptance_criteria": [
      "One mockup formally approved via portal Approve button",
      "Agency has confirmed the selection with the client",
      "Rejected mockup archived",
      "Approved direction and feedback notes documented for development"
    ],
    "order_index": 19
  },
  {
    "epic": "design",
    "num": "3.7",
    "name": "Revision round 1 completed (if requested)",
    "assignee_kind": "admin",
    "description": "Address all feedback from the client's first review in a single pass. A revision round means all comments are addressed together — do not make partial changes and send back for another look. Complete every note from the client's portal feedback in this round. If a requested change contradicts the client's own brief, flag it before implementing and confirm with the client.\n\n**Instructions**\n- Read all portal feedback comments on the approved mockup in full before making any changes\n- Group related feedback — typography changes, color changes, layout changes — and address by category\n- If any feedback is unclear, message the client via portal for clarification before proceeding\n- Update the mockup HTML in Claude Artifacts addressing every comment\n- Upload the revised mockup to the portal\n- Send the client a portal notification that revisions are ready for review\n- Document which feedback items were addressed — screenshot or note each one\n\n_Owner: Agency · Timing: Within 48 hours of feedback submission_",
    "acceptance_criteria": [
      "Every feedback comment from Round 1 has been addressed",
      "Revised mockup uploaded to portal",
      "Client notified that revised design is ready",
      "No outstanding Round 1 feedback items"
    ],
    "order_index": 20
  },
  {
    "epic": "design",
    "num": "3.8",
    "name": "Revision round 2 completed (if requested)",
    "assignee_kind": "admin",
    "description": "If the client has additional feedback after Round 1, address it in Round 2. This is the final included revision round for the design phase. Any changes requested after Round 2 is complete are out of scope and will be quoted separately. Make this clear to the client before Round 2 begins so they know to consolidate all remaining feedback into this single round.\n\n**Instructions**\n- Before Round 2 begins, message the client: \"Please review the updated design and leave all remaining feedback in one session — Round 2 is the final included revision round for the design phase\"\n- Collect all Round 2 feedback via the portal comment tool\n- Address every comment in one pass\n- Upload the final revised mockup to the portal\n- Send the client a portal notification that the final design is ready for approval\n- Any changes requested after this round require a scope change and additional billing\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "All Round 2 feedback addressed",
      "Final revised mockup uploaded to portal",
      "Client informed this is the final included revision round",
      "Client ready to approve the final design"
    ],
    "order_index": 21
  },
  {
    "epic": "design",
    "num": "3.9",
    "name": "Final design direction approved — development unlocked",
    "assignee_kind": "admin",
    "description": "The client gives final approval on the design in the portal using the Approve button. This is the formal sign-off that the design is correct and development can begin. Once approved, any design changes requested during development are out of scope. This approval is the transition point from design to build — it is a significant milestone.\n\n**Instructions**\n- Client clicks Approve on the final design in the portal\n- Agency receives portal notification of final design approval\n- Agency sends a brief confirmation message: \"Design approved — development begins now\"\n- Save the final approved mockup HTML as the development reference file\n- Mark the Design phase complete in the portal — Phase 4 unlocks\n\n_Owner: Client approves, Agency confirms_",
    "acceptance_criteria": [
      "Client has clicked Approve on the final design in the portal",
      "Final approved mockup HTML saved as development reference",
      "Phase 4 Development unlocked in portal",
      "Client confirmed development is starting"
    ],
    "order_index": 22,
    "email_template_key": "web-dev-design-approved",
    "email_trigger": "agency"
  },
  {
    "epic": "dev",
    "num": "4.1",
    "name": "Lovable project created and approved design implemented",
    "assignee_kind": "admin",
    "description": "Create a new Lovable project and implement the approved design. Use the approved mockup HTML as the direct reference — Lovable can accept HTML as a starting prompt, which dramatically speeds up the initial build. Set up the project with the correct settings — project name, domain placeholder, and any integrations needed — before building pages.\n\n**Instructions**\n- Create a new project in Lovable — name it with the client's business name\n- Use the approved mockup HTML as the initial prompt — paste it into Lovable with the instruction \"Build this design as a production-ready website. Without breaking any existing functionality...\"\n- Confirm the base design is implemented correctly — colors, fonts, layout — before building individual pages\n- Set up routing for all confirmed pages in the sitemap\n- Connect Supabase if the project requires any backend functionality (forms, databases)\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "Lovable project created and accessible",
      "Approved design implemented as the base — colors, fonts, and layout match the mockup",
      "Routing set up for all confirmed pages",
      "Base build confirmed before page-by-page development begins"
    ],
    "order_index": 23
  },
  {
    "epic": "dev",
    "num": "4.2",
    "name": "Home page complete",
    "assignee_kind": "admin",
    "description": "Build the home page to match the approved design using the client's actual content. The home page sets the tone for the entire site and typically carries the highest traffic — it must be built to the highest standard. Every section must be complete with real content before the page is checked off.\n\n**Instructions**\n- Build every section of the home page — hero, navigation, all body sections, and footer\n- Use the client's actual copy, images, and logo — not placeholders\n- Implement the SEO title and meta description for this page\n- Add all image alt text for accessibility\n- Confirm the page is responsive on mobile and tablet before marking complete\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "All sections complete with real content — no placeholders",
      "SEO title and meta description implemented",
      "All images have alt text",
      "Page renders correctly on mobile, tablet, and desktop",
      "All CTAs and links functional"
    ],
    "order_index": 24
  },
  {
    "epic": "dev",
    "num": "4.3",
    "name": "About page complete",
    "assignee_kind": "admin",
    "description": "Build the About page with the client's story, team, mission, or background — whatever the client has provided. The About page is often the second most visited page on a site. It must feel personal, credible, and consistent with the brand. Use the client's actual copy and photos — not generic stock images of anonymous people.\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "All content populated with client-provided copy and images",
      "SEO title and meta description implemented",
      "All images have descriptive alt text",
      "Responsive on all screen sizes",
      "Consistent with homepage design"
    ],
    "order_index": 25
  },
  {
    "epic": "dev",
    "num": "4.4",
    "name": "Services page complete",
    "assignee_kind": "admin",
    "description": "Build the Services page with every service or offer the client has specified. This page is where visitors go to understand what the business does and decide if they want to work with them. Every service must be clearly described, priced (if applicable), and linked to a clear CTA — a booking form, contact page, or purchase link.\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "All services listed with clear descriptions",
      "Pricing included if client has confirmed it should be shown",
      "CTA on each service — book, contact, or purchase",
      "SEO title and meta description implemented",
      "Responsive on all screen sizes"
    ],
    "order_index": 26
  },
  {
    "epic": "dev",
    "num": "4.5",
    "name": "Contact page complete",
    "assignee_kind": "admin",
    "description": "Build the Contact page with a working contact form, business contact information, and any relevant location or hours information. The contact form must be tested — form submissions must reach the client's inbox and trigger a confirmation email to the person who submitted. This is a technical task, not just a visual one — a beautiful contact page that doesn't send emails is a failure.\n\n**Instructions**\n- Build the contact form — fields: name, email, message, and any service-specific fields the client needs\n- Connect the form to the client's email via Supabase Edge Function, Resend, or similar\n- Set up a confirmation email to the person submitting — \"We received your message...\"\n- Add all business contact details — email, phone, address, hours, social links\n- Test the form with a real submission before marking complete\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "Contact form built and connected to client's email",
      "Test submission successfully delivered to client's inbox",
      "Confirmation email fires to the submitter",
      "All business contact details populated",
      "SEO title and meta description implemented"
    ],
    "order_index": 27
  },
  {
    "epic": "dev",
    "num": "4.6",
    "name": "Additional pages complete (per scope)",
    "assignee_kind": "admin",
    "description": "Build any additional pages confirmed in the client's contract package — blog, booking, portfolio, FAQ, pricing, shop, or any other pages specific to this client's project. Each page must meet the same standard as the core pages — real content, SEO implemented, responsive, all links functional.\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "All contract-confirmed pages built with real content",
      "SEO title and meta description on every page",
      "All images have alt text",
      "All pages responsive on mobile, tablet, and desktop",
      "No placeholder content remaining on any page"
    ],
    "order_index": 28
  },
  {
    "epic": "dev",
    "num": "4.7",
    "name": "All images optimized and alt text added",
    "assignee_kind": "admin",
    "description": "Every image on the site must be optimized for web (under 300KB where possible without visible quality loss) and have descriptive alt text for ADA compliance and SEO. Unoptimized images are the most common cause of slow page load times, which directly affects both user experience and search rankings.\n\n**Instructions**\n- Compress all images using Squoosh, TinyPNG, or similar — target under 300KB per image\n- Use WebP format where Lovable supports it\n- Add descriptive alt text to every image — describe what is in the image specifically, not just \"image\" or the file name\n- Hero images should be under 500KB — they are above the fold and affect First Contentful Paint\n- Verify alt text covers all decorative and informational images\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "All images under 300KB (hero images under 500KB)",
      "Every image has descriptive alt text",
      "No images missing alt attribute entirely"
    ],
    "order_index": 29
  },
  {
    "epic": "dev",
    "num": "4.8",
    "name": "Open Graph image set for social sharing",
    "assignee_kind": "admin",
    "description": "The Open Graph image is what appears when someone shares the website link on Facebook, LinkedIn, Twitter, or in iMessage. Without it, the platform generates an ugly auto-crop of random page content. Create a branded 1200×630px image using the client's brand colors, logo, and a clear headline. Set it as the default OG image for the site and customize it per key page where relevant.\n\n**Instructions**\n- Create a 1200×630px branded image using Claude Artifacts or Canva — include the logo, a clear headline, and the brand color palette\n- Set the OG image in Lovable's metadata settings for the site\n- Set a custom OG image for the home page, services page, and any other high-traffic pages\n- Test using the Facebook Sharing Debugger or LinkedIn Post Inspector to verify the image appears correctly\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "1200×630px branded OG image created",
      "OG image set as site default in Lovable",
      "Verified using Facebook Sharing Debugger or LinkedIn Post Inspector",
      "Image includes logo and brand colors"
    ],
    "order_index": 30
  },
  {
    "epic": "dev",
    "num": "4.9",
    "name": "Privacy policy and terms pages added",
    "assignee_kind": "admin",
    "description": "Every business website needs a Privacy Policy page and Terms of Use page. These are not optional — they are required for GDPR compliance (if the client serves European visitors), Google Analytics, any contact forms that collect personal data, and payment processing. Use a policy generator to create compliant pages quickly — do not write these from scratch.\n\n**Instructions**\n- Use Termly, Iubenda, or a similar generator to create the Privacy Policy — input the client's business name, contact email, and the data collected (contact form, analytics)\n- Generate Terms of Use with the same tool\n- Create both as pages in Lovable\n- Link both pages in the footer — they must be accessible from every page\n- Confirm with the client that they have reviewed the generated policies — these are their legal documents\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "Privacy Policy page created and published",
      "Terms of Use page created and published",
      "Both pages linked in the footer on every page",
      "Policies reference the correct business name and contact email",
      "Client has reviewed and confirmed the policies"
    ],
    "order_index": 31
  },
  {
    "epic": "dev",
    "num": "4.10",
    "name": "Custom domain connected",
    "assignee_kind": "admin",
    "description": "Connect the client's domain to the Lovable project. The client must own the domain — this is a prerequisite. The agency handles the DNS configuration. Domain propagation can take up to 48 hours — plan for this in the launch timeline so the client is not surprised when their site is not immediately live after the connection is made.\n\n**Instructions**\n- Confirm the client owns the domain and has access to their DNS settings — get DNS login credentials via the portal secure note if needed\n- In Lovable project settings, initiate the custom domain connection\n- Add the required DNS records (CNAME or A record) at the client's domain registrar\n- Wait for propagation — typically 15 minutes to 48 hours depending on the registrar\n- Confirm the domain is live and SSL is active before marking complete\n\n_Owner: Agency · Timing: Allow 48 hours for propagation_",
    "acceptance_criteria": [
      "Domain connected and resolving to the Lovable project",
      "SSL certificate active — site loads on HTTPS",
      "www and non-www both redirect correctly",
      "DNS propagation confirmed — site accessible from multiple devices"
    ],
    "order_index": 32
  },
  {
    "epic": "dev",
    "num": "4.11",
    "name": "Google Analytics connected",
    "assignee_kind": "admin",
    "description": "Connect Google Analytics 4 to the site so the client can track visitors, traffic sources, and page performance from day one. Without analytics, the client has no way to know if their site is working. Set up under the client's Google account — not the agency's — so they own their data permanently. The agency installs it, the client owns it.\n\n**Instructions**\n- Ask the client to create a Google Analytics 4 property under their Google account if they do not have one\n- Get the Measurement ID (G-XXXXXXX) from the client's GA4 property\n- Add the GA4 tracking snippet to Lovable via the project's custom code settings\n- Verify the tracking is working by visiting the site and confirming a real-time visitor appears in GA4\n- Share basic GA4 navigation with the client so they know how to check their stats\n\n_Owner: Agency installs, Client owns_",
    "acceptance_criteria": [
      "GA4 property created under client's Google account",
      "Tracking code installed in Lovable",
      "Real-time visitor confirmed in GA4 dashboard",
      "Client has access to their own GA4 property"
    ],
    "order_index": 33
  },
  {
    "epic": "qa",
    "num": "5.1",
    "name": "Mobile responsiveness tested on iOS and Android",
    "assignee_kind": "admin",
    "description": "Over 60% of web traffic is mobile. Every page must look and function correctly on small screens — not just the homepage. Test on a real iOS device and a real Android device, not just browser dev tools. Dev tools simulate screen size but not real mobile rendering, font scaling, or touch behavior. If you do not have both device types, use BrowserStack.\n\n**Instructions**\n- Test every page on iPhone — check at 390px width (iPhone 14 viewport)\n- Test every page on Android — check at 360px width (standard Android viewport)\n- Check: navigation menu opens and closes correctly on mobile\n- Check: no horizontal scroll on any page at mobile width\n- Check: all text is readable without zooming\n- Check: all buttons and links are tappable — minimum 44px touch target\n- Check: contact form works and submits on mobile\n- Check: images load and scale correctly — no overflow\n- Fix any issues found before proceeding to client preview\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "All pages tested on real or simulated iOS and Android",
      "No horizontal scroll on any page at any mobile width",
      "All navigation functional on mobile",
      "All forms functional on mobile",
      "All text readable without zooming",
      "All buttons have adequate touch target size"
    ],
    "order_index": 34
  },
  {
    "epic": "qa",
    "num": "5.2",
    "name": "All links and buttons tested",
    "assignee_kind": "admin",
    "description": "Click every single link and button on the site. This sounds tedious — it is, and it is necessary. Broken links are the most embarrassing thing to discover on a live website. A client's customer clicks a CTA and gets a 404 — that is a direct failure of the project. Do this systematically, page by page, before sending the preview to the client.\n\n**Instructions**\n- Go through every page systematically\n- Click every navigation link — confirm each loads the correct page\n- Click every CTA button — confirm each goes to the correct destination\n- Click every footer link\n- Click every social media link — confirm they open to the correct profiles\n- Check all email links — confirm mailto: links open correctly\n- Check all phone number links — confirm tel: links work on mobile\n- Fix every broken link before marking complete\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "Every link on every page tested",
      "Zero broken links — no 404s or dead ends",
      "All social links open to correct profiles",
      "All CTAs lead to correct destinations",
      "All mailto and tel links functional"
    ],
    "order_index": 35
  },
  {
    "epic": "qa",
    "num": "5.3",
    "name": "Contact form tested — submission and confirmation verified",
    "assignee_kind": "admin",
    "description": "Submit a real test message through the contact form using a personal email address. Verify the submission reaches the client's inbox AND that the confirmation email reaches the submitter's inbox. Test from both desktop and mobile. If either email fails to arrive, the form is broken regardless of how it looks.\n\n**Instructions**\n- Submit a test message from desktop using a personal email address\n- Confirm the notification arrives in the client's designated inbox within 2 minutes\n- Confirm the confirmation email arrives in the submitter's inbox within 2 minutes\n- Repeat the test from a mobile device\n- Test any additional forms on the site (booking forms, newsletter opt-ins, etc.)\n- Check spam folders if emails do not arrive — and if they land in spam, investigate the deliverability issue\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "Test submission received in client's inbox — not spam",
      "Confirmation email received in submitter's inbox — not spam",
      "Both tests passed on desktop and mobile",
      "All forms on the site tested"
    ],
    "order_index": 36
  },
  {
    "epic": "qa",
    "num": "5.4",
    "name": "Sitemap submitted to Google Search Console",
    "assignee_kind": "admin",
    "description": "Submitting the sitemap to Google Search Console tells Google that the site exists and which pages to index. Without this, it can take weeks or months for Google to discover the site organically. This takes 5 minutes and directly accelerates the client's SEO results from day one. Set up under the client's Google account.\n\n**Instructions**\n- Ask the client to add their domain to Google Search Console under their Google account\n- Verify domain ownership using the DNS TXT record method\n- Generate the sitemap URL from Lovable — typically domain.com/sitemap.xml\n- Submit the sitemap URL in Google Search Console under Sitemaps\n- Confirm the sitemap is accepted — status should show Success\n\n_Owner: Agency installs, Client owns_",
    "acceptance_criteria": [
      "Domain verified in Google Search Console under client's account",
      "Sitemap URL submitted and accepted — status shows Success",
      "Client has access to their own Search Console property"
    ],
    "order_index": 37
  },
  {
    "epic": "qa",
    "num": "5.5",
    "name": "Pre-launch preview sent to client for final approval",
    "assignee_kind": "admin",
    "description": "Before the site goes live on the custom domain, send the client a preview of the full site. This is their opportunity to review the complete built website with real content and confirm everything is correct before it is public. Use the portal preview and the Design Preview email template. This is not a revision opportunity — it is a final confirmation. Any changes at this stage that are outside the agreed scope are billed separately.\n\n**Instructions**\n- Upload the Lovable preview URL to the portal — all pages accessible from the preview\n- Send the Design Preview email via SureContact\n- Note in the email or portal that this is the pre-launch final review — the site goes live once approved\n- Set a review deadline of 48 hours\n- If the client has minor corrections — fix them. If they request significant new changes — quote them as out of scope\n\n_Owner: Agency sends, Client approves_",
    "acceptance_criteria": [
      "Preview URL uploaded to portal covering all pages",
      "Design Preview email sent and delivered",
      "Client has reviewed the full site",
      "Client has given formal approval via portal Approve button"
    ],
    "order_index": 38,
    "email_template_key": "web-dev-prelaunch-preview",
    "email_trigger": "agency"
  },
  {
    "epic": "qa",
    "num": "5.6",
    "name": "Client gives final pre-launch approval",
    "assignee_kind": "client",
    "description": "The client reviews the full site in the portal preview and clicks Approve to confirm they are ready to launch. This is a formal approval — it signals that the client is satisfied with the site and authorizes the agency to publish it live. Without this approval, the site does not launch.\n\n_Owner: Client_",
    "acceptance_criteria": [
      "Client has reviewed all pages in the preview",
      "Client has clicked Approve in the portal",
      "Agency has received the approval notification",
      "No outstanding issues flagged by the client"
    ],
    "order_index": 39
  },
  {
    "epic": "launch",
    "num": "6.1",
    "name": "Final payment confirmed before launch",
    "assignee_kind": "auto",
    "description": "The portal automatically checks that the final payment has been received via SureCart before the launch tasks unlock. The site does not go live until the balance is paid. This is a financial gate — it is not negotiable and it is not manual. The system handles it so there is no awkward conversation about payment before launch.\n\n_Owner: System_",
    "acceptance_criteria": [
      "SureCart shows final payment as successful",
      "Portal automatically unlocks Phase 6 launch tasks",
      "If payment fails — client notified, launch paused until resolved"
    ],
    "order_index": 40
  },
  {
    "epic": "launch",
    "num": "6.2",
    "name": "Site published to live domain",
    "assignee_kind": "admin",
    "description": "Publish the Lovable project to the connected custom domain. Once published, the site is live and accessible to the public. This is the moment the client has been waiting for — treat it accordingly. Confirm the live site before notifying the client.\n\n**Instructions**\n- Confirm final payment received and client has given approval in the portal\n- Publish the Lovable project to the live domain\n- Wait for the deployment to complete — Lovable will confirm when live\n- Visit the live URL from a fresh browser and confirm the site loads correctly\n- Check that HTTPS is active — no security warnings\n- Check the home page, one internal page, and the contact form\n- Do not notify the client until you have personally confirmed the live site\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "Site live on custom domain",
      "HTTPS active — no security warnings",
      "Site loads correctly on desktop and mobile",
      "Contact form functional on live domain",
      "No placeholder content visible on live site"
    ],
    "order_index": 41
  },
  {
    "epic": "launch",
    "num": "6.3",
    "name": "Post-launch smoke test",
    "assignee_kind": "admin",
    "description": "After publishing, do a final quick test of the live site. This catches any issues that appear in production but not in the preview — DNS caching, SSL issues, or Lovable deployment differences. Five minutes of checking now prevents embarrassing issues being reported by the client or their customers.\n\n**Instructions**\n- Visit the live URL and confirm the home page loads — check desktop and mobile\n- Click through to 3 internal pages — confirm navigation works\n- Submit a test contact form on the live domain — confirm delivery\n- Check that all social links in the footer work\n- Confirm Google Analytics is tracking on the live domain — check GA4 real-time\n- Confirm HTTPS is active on all pages — no mixed content warnings\n\n_Owner: Agency · Timing: Immediately after publishing_",
    "acceptance_criteria": [
      "Home page loads on live domain — desktop and mobile",
      "Navigation functional on live domain",
      "Contact form test submission received on live domain",
      "GA4 tracking confirmed on live domain",
      "HTTPS active — no security warnings"
    ],
    "order_index": 42
  },
  {
    "epic": "launch",
    "num": "6.4",
    "name": "Pre-launch announcement sent to client's audience (if requested)",
    "assignee_kind": "admin",
    "description": "If the client has requested a launch announcement — a social post, an email to their list, or a launch caption — prepare and send it now. This is only in scope if it was included in the original contract package. If the client asks for this at launch and it was not in the contract, quote it as an add-on.\n\n**Instructions**\n- Only proceed if a launch announcement was included in the original contract package\n- Write the launch caption or email in the client's brand voice\n- Get client approval on the copy before sending\n- Send or schedule via the client's channels\n- If not in scope — note it to the client and offer it as an add-on via the carousel builder\n\n_Owner: Agency (if in scope)_",
    "acceptance_criteria": [
      "If in scope: launch announcement sent or scheduled",
      "Client approved copy before send",
      "If not in scope: client informed it is available as an add-on"
    ],
    "order_index": 43
  },
  {
    "epic": "launch",
    "num": "6.5",
    "name": "Launch confirmed — client notified via SureContact",
    "assignee_kind": "admin",
    "description": "Send the client a launch confirmation notification via SureContact. This email confirms the site is live, shares the live URL, congratulates them on launching, and reminds them what to share with their audience. This is a celebratory email — the client has waited for this moment. Make it feel like the milestone it is.\n\n**Instructions**\n- Confirm the smoke test is complete and the site is live\n- Click Send Launch Notification in the portal\n- SureContact fires the launch confirmation email with the live URL\n- Mark Phase 6 complete in the portal — Phase 7 unlocks\n\n_Owner: Agency triggers, SureContact sends_",
    "acceptance_criteria": [
      "Launch email delivered to client — confirmed in SureContact activity log",
      "Live URL included in the email",
      "Phase 7 Handoff tasks unlocked in portal"
    ],
    "order_index": 44,
    "email_template_key": "web-dev-launch-confirmation",
    "email_trigger": "agency"
  },
  {
    "epic": "handoff",
    "num": "7.1",
    "name": "Loom walkthrough recorded",
    "assignee_kind": "admin",
    "description": "Record a 10–15 minute Loom walkthrough of the completed site. This is the handoff video — it replaces a live client call in most cases and gives the client a permanent reference they can rewatch. Cover every page, all features, how to request updates, and what is included going forward. A well-recorded handoff video dramatically reduces post-launch support questions.\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "Loom recorded covering all pages and features",
      "Contact form demonstration included",
      "How to request updates explained",
      "Under 18 minutes",
      "Loom URL saved to portal"
    ],
    "order_index": 45
  },
  {
    "epic": "handoff",
    "num": "7.2",
    "name": "Delivery email sent with Loom and all asset links",
    "assignee_kind": "admin",
    "description": "Once the Loom is recorded and the URL is pasted into the portal, send the formal delivery email via SureContact. This email contains the Loom link, the live site URL, the Google Analytics link, and instructions for requesting updates. It is the official handoff document — the client keeps this email as the reference for everything that was delivered.\n\n**Instructions**\n- Paste the Loom URL into the delivery_loom_url field in the client's SureContact custom fields\n- Click Send Delivery Email in the portal dashboard\n- SureContact fires the AI OS Delivery template — UUID 53e50123 — with all asset links populated from custom fields\n- Confirm delivery in SureContact activity log\n- Mark Phase 7 delivery task complete\n\n_Owner: Agency triggers, SureContact sends_",
    "acceptance_criteria": [
      "Loom URL populated in SureContact custom field before sending",
      "Delivery email delivered — confirmed in SureContact activity log",
      "Loom link, live site URL, and GA4 link all included in the email"
    ],
    "order_index": 46
  },
  {
    "epic": "handoff",
    "num": "7.3",
    "name": "Client feedback form sent 3 days post-delivery",
    "assignee_kind": "auto",
    "description": "Three days after the delivery email is sent, a client feedback form fires automatically via SureContact. This gives the client time to explore their new site before being asked for feedback. Testimonials and reviews from web dev clients are valuable social proof — this automation ensures it is always collected without requiring the agency to remember to ask.\n\n_Owner: System · Timing: 3 days after delivery email send_",
    "acceptance_criteria": [
      "Feedback request fires automatically 3 days after delivery email",
      "Feedback form accessible — client can complete in under 3 minutes",
      "Agency notified when feedback is submitted"
    ],
    "order_index": 47,
    "email_template_key": "web-dev-postlaunch-followup",
    "email_trigger": "auto"
  },
  {
    "epic": "handoff",
    "num": "7.4",
    "name": "Project retrospective completed internally",
    "assignee_kind": "admin",
    "description": "Before archiving the project, spend 10 minutes reviewing what went well and what to improve. This does not need to be formal — a few bullet points saved as an internal note in the portal is enough. The goal is to improve the process with each project. Patterns in what clients struggle with, what takes longer than expected, or what causes confusion are only visible if you look for them.\n\n**Instructions**\n- Review the project timeline — where did it run on schedule, where did it stall?\n- Review client communication — any confusion or repeated questions that a better process would prevent?\n- Note any tasks that took significantly longer than expected\n- Note any client feedback that was surprising or that suggests a gap in the brief or questionnaire\n- Add one improvement to the workflow template if warranted\n- Save the retrospective as an internal note in the portal project\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "Retrospective completed — at minimum 3 notes saved",
      "Any process improvements identified and noted for template update",
      "Retrospective saved to portal internal notes"
    ],
    "order_index": 48
  },
  {
    "epic": "handoff",
    "num": "7.5",
    "name": "Project analytics and accounting completed",
    "assignee_kind": "admin",
    "description": "Record the project's financial and time details before closing. This data informs future pricing and helps identify which types of projects are most profitable relative to time invested. A project that looks profitable by revenue may not be once total hours are factored in — knowing this changes how you scope and price future work.\n\n**Instructions**\n- Record total revenue received for this project\n- Record total hours spent — estimate by phase if not tracked precisely\n- Calculate effective hourly rate — total revenue divided by total hours\n- Note any scope additions or out-of-scope work that was billed or should have been billed\n- Mark all invoices as paid in accounting\n- Save these numbers in the project record\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "Total revenue recorded",
      "Total hours estimated or tracked",
      "Effective hourly rate calculated",
      "All invoices confirmed paid",
      "Financial summary saved to project record"
    ],
    "order_index": 49
  },
  {
    "epic": "handoff",
    "num": "7.6",
    "name": "Project archived",
    "assignee_kind": "admin",
    "description": "Archive the project in the portal and mark it as complete. This moves it out of the active project view, updates the client's status in Supabase, and closes the project lifecycle. If the client is being transitioned to an AI OS retainer, ensure the retainer onboarding has already started before archiving the project — do not close the project record until the client's next engagement is active.\n\n**Instructions**\n- Confirm all tasks in all phases are marked complete\n- Confirm delivery email was sent and Loom was received\n- Confirm feedback form was sent\n- Confirm all invoices are paid\n- If transitioning to AI OS retainer — confirm retainer is active before archiving\n- Mark the project as Complete in the portal — client status updates in Supabase\n- Archive the project from the active view\n\n_Owner: Agency_",
    "acceptance_criteria": [
      "All phases and tasks marked complete",
      "All financial tasks confirmed complete",
      "Project status updated to Complete in Supabase",
      "Project archived and removed from active view",
      "If applicable: AI OS retainer active before archiving"
    ],
    "order_index": 50
  }
];

/**
 * Seeds the full Web Dev backlog (7 epics + 50 tasks) for the given project.
 * Idempotent: if any epic with journey_stage_key starting with "web_dev:"
 * already exists for the project, the call is a no-op.
 */
export async function seedWebDevTasks(
  sb: SupabaseClient,
  projectId: string,
): Promise<{ seeded: boolean; epics: number; tasks: number; reason?: string }> {
  // Idempotency check
  const { data: existing } = await sb
    .from("project_task_epics")
    .select("id")
    .eq("client_project_id", projectId)
    .like("journey_stage_key", "web_dev:%")
    .limit(1);
  if (existing && existing.length > 0) {
    return { seeded: false, epics: 0, tasks: 0, reason: "already_seeded" };
  }

  // Insert epics
  const epicRows = WEB_DEV_EPICS.map((e, i) => ({
    client_project_id: projectId,
    name: e.name,
    color: e.color,
    journey_stage_key: `web_dev:${e.key}`,
    order_index: i + 1,
    locked: true,
  }));
  const { data: insertedEpics, error: epicErr } = await sb
    .from("project_task_epics")
    .insert(epicRows)
    .select("id, journey_stage_key");
  if (epicErr) throw epicErr;
  const epicByKey = new Map<string, string>();
  for (const e of insertedEpics ?? []) {
    const key = (e.journey_stage_key as string).replace("web_dev:", "");
    epicByKey.set(key, e.id as string);
  }

  // Insert tasks
  const taskRows = WEB_DEV_TASKS.map((t) => {
    const email = t.email_template_key
      ? {
          template_key: t.email_template_key,
          trigger: t.email_trigger,
          sent_at: null as string | null,
          last_send_error: null as string | null,
        }
      : null;
    return {
      client_project_id: projectId,
      epic_id: epicByKey.get(t.epic) ?? null,
      name: `${t.num} — ${t.name}`,
      description: t.description,
      status: "backlog",
      priority: "normal",
      assignee_kind: t.assignee_kind,
      order_index: t.order_index,
      acceptance_criteria: t.acceptance_criteria.map((text) => ({
        id: crypto.randomUUID(),
        text,
        done: false,
      })),
      email_template: email,
    };
  });
  const { error: tasksErr } = await sb.from("project_tasks").insert(taskRows);
  if (tasksErr) throw tasksErr;

  return { seeded: true, epics: epicRows.length, tasks: taskRows.length };
}

export interface ContractTaskCompletionResult {
  id: string;
  name: string;
  num: string;
  was_already_complete: boolean;
}

/**
 * Auto-complete the Web Dev tasks that contract signing satisfies (1.2 + 1.3).
 *
 * Lookup is anchored on the canonical task name prefix `${num} — ` produced by
 * seedWebDevTasks() so we never accidentally close a different task that
 * happens to start with the same digits (e.g. 11.2, 1.20). Returns the list of
 * matched tasks so the caller can surface them in the signing audit log.
 */
export async function completeWebDevContractTasks(
  sb: SupabaseClient,
  projectId: string,
  completedAt: Date,
): Promise<ContractTaskCompletionResult[]> {
  const nums = [...WEB_DEV_CONTRACT_AUTO_COMPLETE_NUMS];
  const orFilter = nums.map((n) => `name.ilike.${n} —%`).join(",");
  const { data: matched, error: matchErr } = await sb
    .from("project_tasks")
    .select("id, name, status")
    .eq("client_project_id", projectId)
    .or(orFilter);
  if (matchErr) throw matchErr;

  const results: ContractTaskCompletionResult[] = [];
  for (const num of nums) {
    const prefix = `${num} —`;
    const row = (matched ?? []).find((r: { name: string }) =>
      typeof r.name === "string" && r.name.startsWith(prefix),
    );
    if (!row) {
      console.warn(`[web-dev-tasks] no task found for num=${num} in project=${projectId}`);
      continue;
    }
    const alreadyDone = row.status === "complete";
    if (!alreadyDone) {
      await sb
        .from("project_tasks")
        .update({ status: "complete", completed_at: completedAt.toISOString() })
        .eq("id", row.id);
    }
    await sb.from("project_task_activity").insert({
      task_id: row.id,
      kind: "contract_auto_complete",
      message: alreadyDone
        ? `Task already complete when contract was signed (${num}).`
        : `Auto-completed by contract signing (${num}).`,
      metadata: { num, source: "contract-sign" },
    });
    results.push({ id: row.id, name: row.name, num, was_already_complete: alreadyDone });
  }
  return results;
}

