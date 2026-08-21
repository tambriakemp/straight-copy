// The proposal library: real documents Cre8 Visions has sent.
//
// PROPOSAL_DNA describes how a proposal should read in about 1,290 tokens, and
// that description sat in every prompt Bria ever saw — including "what's
// overdue?" — while the actual documents were nowhere in the system. Matching a
// voice from a description is a categorically harder job than matching it from
// the document. When Bree handed Claude the Aviya brief directly with "keep the
// same format as before", it produced a 29-page proposal she was happy with.
// The difference was not the model. It was having the reference.
//
// Embedded as a module rather than read from disk: a .md file adjacent to an
// edge function is not reliably deployed, and a reference the agent cannot open
// in production is worse than none, because nothing says it is missing.
//
// GROWING THIS LIBRARY IS THE POINT. Every proposal Bree approves should be
// added here. That is how the agent gets better at this over time without
// anyone writing code — and it is a deliberate maintenance step, not automatic.

export interface Exemplar {
  /** Stable key the agent asks for. */
  key: string;
  name: string;
  /** Free text — "marketing retainer", "app build". Matched loosely. */
  kind: string;
  summary: string;
  text: string;
}

const MENOVIA_RETAINER = `---
name: Menovia.ai — App Growth & Install Engine
kind: marketing retainer
engagement: monthly retainer, app store optimisation and paid install campaigns
client: Menovia (Dr. Khadra Kahin) — a perimenopause and menopause app
sections: 12
length: ~24,000 characters
sent: 20 August 2026
---

<!--
This is a REAL proposal Cre8 Visions sent. It is the authority on how these
read — not any description of them. Match its register, its specificity and its
structure-for-this-kind-of-engagement; do not copy its content.

Note what it does that a generic proposal does not:

  * Each numbered section opens with a short bolded thesis under the heading.
    Section 01 is "The app is live. Now she has to find it."
  * It names the actual customer — "women 35–65 experiencing perimenopause" —
    rather than "the target demographic".
  * It says what it is NOT doing, and why, before anyone asks.
  * Money is concrete and near the front, with pass-throughs separated from fee.
  * It ends on acceptance, not on a pitch.

Its twelve sections are what a marketing retainer needed. They are not a
template. A different engagement gets whatever structure that engagement needs.
-->

CRE8 VISIONS
AI BUSINESS ARCHITECTURE
MARKETING RETAINER PROPOSAL
Menovia.ai
App Growth & Install Engine
App Store Optimization + Paid Install Campaigns

PREPARED FOR
Dr. Khadra Kahin
Founder, Menovia
 | PREPARED BY
Tambria Kemp
Founder, Cre8 Visions

Proposal Date: August 20, 2026 · Valid for 30 days · Confidential
CONTENTS
What's inside.

01
 | The Opportunity
 | What we're solving with this retainer

02
 | Engagement Summary
 | Retainer, pass-throughs, and what's included at a glance

03
 | The Strategic Thesis
 | Why the listing wins before the ad does

04
 | What We're Doing
 | The full scope, grouped into three strategic pillars

05
 | Creative & Voice
 | How we protect the Menovia voice through every piece

06
 | The First 90 Days
 | Foundation, optimization, scale — month by month

07
 | Reporting & What You'll Know
 | The monthly report and what it will tell you

08
 | Investment & Pass-Throughs
 | Transparent pricing and how ad spend scales

09
 | What's Included
 | A full deliverables list

10
 | What's Not Included
 | Scope clarity to protect both parties

11
 | Terms & Next Steps
 | Billing, ownership, onboarding, and reporting

12
 | Acceptance
 | Signature page

01 — THE OPPORTUNITY
The app is live. Now she has to find it.

Menovia has built something women have been searching for. The next job is making sure they can actually find it — and download it — when they go looking.
Women in perimenopause and menopause are already searching. They type "menopause tracker," "hormone symptoms," "hot flash log," and "perimenopause help" into the App Store and Google Play every day. Menovia needs to be what they see first, and it needs to convert them the moment they land on the listing. That's what this engagement is for.
This proposal is deliberately narrow. It focuses on the two things that move installs — the App Store listing and the paid campaigns that put Menovia in front of the right woman at the right moment. Everything else in a marketing plan (organic social, community, email nurture, blog outreach) can be layered in over time. But without discoverability and paid install acquisition, none of the rest of it matters, because there's no one downloading the app for the other tactics to nurture.

THE GOAL
A sustainable install engine — qualified downloads from women who are ready to engage, at a cost per install that gets smarter every month. Not vanity metrics. Not chasing followers. Installs from the right women, and a system that compounds.

WHAT THIS RETAINER OWNS
ASO Foundation — Optimize Menovia's App Store and Google Play listings for maximum discoverability and conversion
Paid Acquisition — Drive qualified installs from women 35–65 experiencing perimenopause or menopause
Scale Loop — Build and scale campaigns across Apple Search Ads and Meta as data confirms what works
CPI Reduction — Lower cost-per-install month over month through continuous creative and targeting optimization
Organic Authority — Establish keyword authority so Menovia ranks organically for menopause-related search terms
Transparent Reporting — Deliver monthly reporting on installs, CPI, keyword rankings, and return on ad spend
02 — ENGAGEMENT SUMMARY
The retainer, at a glance.

$750/mo
MANAGEMENT RETAINER
 | $450/mo
AD SPEND (PASS-THROUGH)
 | Monthly
REPORTING CADENCE

What Menovia Is Investing
The management retainer covers every service in this proposal — full ASO across both platforms, campaign management across Apple Search Ads and Meta, creative production, ongoing optimization, and monthly reporting. Ad spend is passed through at cost with zero markup. Every dollar of ad spend goes directly to Apple and Meta, not to Cre8 Visions.
Total monthly investment starts at approximately $1,300 to $1,450 including all pass-throughs. Ad spend grows as the data confirms what's working — this is not a static budget, it's a scaling engine.

CLIENT
 | Dr. Khadra Kahin, Menovia

ENGAGEMENT
 | Menovia.ai — App Growth & Install Marketing

SCOPE
 | App Store Optimization · Apple Search Ads · Meta App Install Ads · Creative Production · Monthly Reporting

MANAGEMENT RETAINER
 | $750 per month, billed on the 1st

AD SPEND (PASS-THROUGH)
 | $450 per month to start ($150 Apple Search Ads + $300 Meta), scales with performance

APPTWEAK (PASS-THROUGH)
 | $99 to $249 per month, plan selected based on volume needs

TOTAL MONTHLY INVESTMENT
 | Approximately $1,300 to $1,450 to start

AD ACCOUNT OWNERSHIP
 | Menovia owns all ad accounts — Cre8 Visions manages, Menovia owns the data

ON TOTAL COST — FULL TRANSPARENCY
The $750 retainer is what Menovia pays Cre8 Visions. The $450 ad spend goes to Apple and Meta. The $99–$249 goes to AppTweak. Total monthly outlay ranges from $1,299 to $1,449 to start. No markup on any pass-through. No hidden fees. What you see is what it costs.

03 — THE STRATEGIC THESIS
The listing wins before the ad does.

Most agencies rush to ad spend. It's visible, it's measurable, and it feels like work getting done. But the listing is where the conversion actually happens — and if the listing doesn't convert, the ad spend is paying to send traffic to a leaky bucket.
Here's what happens on most app marketing engagements. The agency launches campaigns immediately because the client wants to see installs. The ads drive taps to a listing that wasn't optimized. The taps don't convert to installs at a good rate. The CPI is high. The client asks why. The agency blames the creative or the targeting and asks for a bigger budget. The listing — the one thing that determines whether every tap turns into an install — never gets touched.
This engagement inverts that. ASO is the first thing that ships. The App Store and Google Play listings are optimized end-to-end before the first dollar of ad spend gets deployed at scale. That means every ad dollar going out is landing on a listing that's designed to convert — and every organic search that finds Menovia is landing on a listing that's designed to rank.

WHAT THIS APPROACH GIVES MENOVIA
Ads That Convert — A listing designed to convert. Ad spend lands on a page that's built to close, not a page that just describes the product.
Organic Ranking — Free installs from search. A well-optimized listing ranks organically for menopause-related keywords and pulls installs without ad spend.
Compounding CPI — Lower CPI over time. Better listings → better tap-to-install conversion → lower cost per install → more installs from the same budget.
Keyword Authority — A defensible position in the App Store. Once keyword rankings are established, competitors can't easily displace them.
Efficient Spend — Every ad dollar working harder. Because the listing does the closing, the ads can focus on driving qualified traffic instead of trying to overcome a weak page.

THE BOTTOM LINE
Ads drive traffic. Listings drive installs. If you're only paying for one of those, you're paying for the wrong one. This engagement pays for both — with ASO as the foundation, and paid campaigns scaling on top of a listing that's already converting.

04 — WHAT WE'RE DOING
The full scope.

The work is grouped into three strategic pillars — ASO Foundation, Paid Acquisition, and Creative Production — because that's how the engagement actually flows. Foundation before spend. Spend before scale. Creative fueling both.

PILLAR ONE
App Store Optimization
The foundation. Both stores, end-to-end.

APPLE APP STORE
Title — App Title optimized with primary keyword — balancing brand recognition and search discoverability
Subtitle — 30-character subtitle for maximum search indexing
Keyword Field — Full 100-character keyword field research — menopause, perimenopause, hormone tracking, hot flashes, symptom tracker, and related high-volume terms
Description — Rewritten for conversion — leading with the pain point, building to the solution, closing with a clear CTA
Screenshots — Art direction for 6–10 screenshots that tell a story and convert browsers into downloaders
Preview Video — Script and art direction for the App Store preview video — autoplay video is one of the highest-converting ASO elements available
Ratings Strategy — In-app prompt timing recommendations to maximize review volume and star rating
GOOGLE PLAY STORE
Title — Keyword-optimized title within Google Play's 50-character limit
Short Description — 80-character hook optimized for both search ranking and conversion
Long Description — Full 4,000-character description written for Google's indexing algorithm and human readers — keyword-rich, story-driven, conversion-focused
Feature Graphic — Art direction for the banner graphic at the top of the listing
Screenshots — Phone and tablet screenshots optimized for Google Play's display format
Category & Tags — Correct category placement and tag optimization for maximum browse visibility
ONGOING ASO MONITORING — POWERED BY APPTWEAK
ASO is not a one-time task. Keyword rankings shift, competitors update their listings, and the algorithm rewards apps that stay active. Rather than tracking these changes manually, we use AppTweak — the industry-standard ASO intelligence platform — to automate keyword rank tracking, competitor monitoring, and performance data across both stores.
AppTweak Subscription — Industry-standard ASO intelligence — $99 to $249/month depending on plan (pass-through at cost)
Competitor Intelligence — Automated alerts when competitors update listings, gain or lose rankings, or change creative
Search Volume Data — Real-time search volume trends so we always target the highest-opportunity terms
A/B Testing — Data-backed recommendations for Apple's Product Page Optimization and Google's Store Listing Experiments
Monthly Updates — Listing updates each month based on AppTweak data — rankings inform every change we make

PILLAR TWO
Paid Acquisition
Apple Search Ads + Meta. High intent + broad reach.

APPLE SEARCH ADS — THE HIGHEST-INTENT TRAFFIC AVAILABLE
Apple Search Ads places Menovia at the top of App Store search results when women search for menopause and perimenopause-related terms. This is the single highest-intent traffic source on the planet — a woman searching "menopause tracker" in the App Store is already looking for what Menovia offers. We catch her at the exact moment she's ready to download.
We use Apple Search Ads Advanced — the full-control version — which gives us keyword-level bidding, custom audience targeting, creative set testing, and detailed performance data by keyword, match type, and audience segment. This level of control is what allows us to optimize efficiently and drive down CPI over time.
Campaign Type — Search results campaigns — ads appear at the top of App Store search results for target terms
Keyword Strategy — Branded terms, symptom keywords, category terms, and competitor terms — tiered by intent and bid accordingly
Audience Targeting — New users, users of competitor apps, and custom audience segments by age and device
Creative — Custom Product Pages for different audience segments — each tailored to a specific symptom or entry point
Bidding — Cost-per-tap bidding optimized weekly for install volume and quality
Reporting — Impressions, taps, installs, tap-through rate, and CPI pulled weekly by keyword
Ad Spend — Starting at $150/month — scaled based on CPI performance and audience data
META APP INSTALL CAMPAIGNS — THE REACH LAYER
Meta gives us the broadest reach and the most sophisticated audience targeting available. We build campaigns targeting women 35–65 with interest signals around menopause, women's health, hormones, wellness, and midlife — using creative that stops the scroll by speaking directly to her experience. As performance data accumulates and we identify the audiences and creatives driving the lowest CPI and highest-quality installs, Meta ad spend scales accordingly.
Campaign Objective — App installs — optimized for install volume and post-install engagement
Audience Targeting — Women 35–65, interests in menopause, perimenopause, hormones, women's health, wellness, and midlife
Lookalike Audiences — Built from early installer data as install volume grows — typically activated at 100+ installs
Creative Formats — Reels-style video, static image, and carousel — all written in Menovia's brand voice
Placements — Facebook Feed, Instagram Feed, Instagram Reels, Instagram Stories
Optimization — Weekly creative rotation, audience split testing, and bid adjustments based on CPI data
Ad Spend — Starting at $300/month — increased as audience findings confirm top-performing segments and creative angles
05 — CREATIVE & VOICE
Every ad sounds like Menovia.

Every ad platform lives or dies on creative. And every ad we produce sounds like Menovia — warm, human, and built for the woman who needs it most. No stock photo energy. No pharmaceutical ad vibes. Real women, real symptoms, real relief.
Cre8 Visions produces all ad creative in-house. That means the same team that understands Menovia's brand voice, audience, and mission is writing the headlines, directing the visuals, and building the video scripts — not a freelancer who's never worked in the space.

WHAT WE PRODUCE
Video Ad Scripts — Short-form scripts, 15–30 seconds, built for Meta Reels and Instagram Stories placements
Static Ad Creative — On-brand image ads for Meta Feed placements, produced monthly in rotation
App Store Assets — Art direction for screenshot sets and preview video script for both App Store and Google Play listings
Copy — Every headline, description, and CTA written in Menovia's brand voice — never generic, never off-brand
Monthly Refresh — Creative rotated monthly based on performance — underperforming ads are replaced fast, top performers are scaled

WHY THIS MATTERS
The reason most app install ads feel like ads is that the creative was made by someone who doesn't know the brand. That doesn't happen here. The person writing the copy for a Meta Reel targeting a 47-year-old woman experiencing night sweats has spent months in Menovia's brand voice. That's the difference between ads that get scrolled past and ads that stop the scroll.

06 — THE FIRST 90 DAYS
Foundation. Optimization. Scale.

The first 90 days follow a specific rhythm. Month one builds the foundation. Month two optimizes what's working. Month three and beyond, we scale on the data.

PHASE 01
Foundation & Launch
Month One · ASO ships, campaigns go live, data starts flowing

Full ASO audit and optimization live on both App Store and Google Play
AppTweak monitoring activated — baseline keyword rankings captured
Apple Search Ads account set up and campaigns launched
Meta app install campaigns built, creative produced, and launched
First install data begins flowing in from both platforms

PHASE 02
Optimization
Month Two · What worked gets scaled, what didn't gets replaced

Creative performance analysis — winning ads scaled, underperformers replaced
Apple Search Ads keyword bid adjustments based on month one CPI and tap-through data
ASO listing updates informed by the first month of AppTweak keyword ranking data
Lookalike audiences built on Meta from early installer data (typically at 100+ installs)
First full monthly report delivered with scaling recommendations

PHASE 03
Scale
Month Three & Beyond · The system gets smarter every month

Ad budgets scaled on the platform producing the strongest CPI and install quality
New creative concepts tested based on what the data says is resonating
ASO keyword expansion into secondary and long-tail terms
A/B testing of App Store screenshots and Google Play listing experiments
Full optimization rhythm established — the engine compounds
07 — REPORTING & WHAT YOU'LL KNOW
Delivered by the 5th of every month.

Every report is built on the same principle — no vanity metrics, no fluff. You will always know exactly where the money went, what it produced, and what we are doing about it next month.

WHAT'S IN THE MONTHLY REPORT
App Installs — Total installs broken down by platform and campaign
Cost Per Install — CPI by platform, trending month over month — is it going up, down, or staying flat, and why
Keyword Rankings — ASO keyword position changes tracked automatically via AppTweak — where Menovia is ranking, and where it wasn't ranking last month
Creative Performance — Which ads are driving installs, which are being rotated out, and what's coming next
Ad Spend Summary — Exact spend by platform — no summary numbers, actual line-item transparency
Scaling Recommendations — Data-backed recommendations on which platform and audience to scale next, and how much budget to shift
08 — INVESTMENT & PASS-THROUGHS
$750/mo management retainer.
Plus pass-through ad spend and tooling at cost — no markup.

The retainer covers everything Cre8 Visions does. Ad spend and AppTweak are pass-throughs, billed at exact cost with no markup added. This is what full transparency looks like — every dollar accounted for, every line clearly labeled.

Cre8 Visions Management Retainer
Full ASO, campaign management, creative production, reporting, and strategy. All Cre8 Visions services included.
 | $750/mo

Apple Search Ads — Ad Spend
Pass-through, at cost. Paid directly to Apple. Starting budget — scales with performance.
 | $150/mo

Meta App Install Ads — Ad Spend
Pass-through, at cost. Paid directly to Meta. Starting budget — scales with performance.
 | $300/mo

AppTweak — ASO Intelligence
Pass-through, at cost. Plan selected based on volume — $99 to $249/mo depending on tier.
 | $99–$249/mo

TOTAL MONTHLY INVESTMENT
To start — scales with performance
 | $1,299–$1,449

ON SCALING AD SPEND
Ad spend is not static. As audience data accumulates and performance confirms what's working, Apple Search Ads and Meta budgets scale. Every increase is data-backed and pre-approved — no surprise budget changes. Menovia sets the ceiling; Cre8 Visions recommends the pace.
09 — WHAT'S INCLUDED
The complete deliverables list.

APP STORE OPTIMIZATION — BOTH STORES
Full Apple App Store listing optimization — title, subtitle, keyword field, description, screenshots direction, preview video direction
Full Google Play listing optimization — title, short description, long description, feature graphic direction, screenshots direction, category and tags
Keyword research and strategy — 100-character Apple keyword field, Google Play indexing terms
Monthly listing updates informed by AppTweak keyword ranking data
A/B test recommendations for Apple Product Page Optimization and Google Play Store Listing Experiments
In-app ratings prompt timing strategy
PAID ACQUISITION — APPLE SEARCH ADS
Apple Search Ads Advanced account setup and campaign build
Search results campaigns with tiered keyword strategy — branded, symptom, category, competitor
Custom Product Pages by audience segment
Weekly bid optimization and keyword expansion based on CPI data
Custom audience targeting by age, device, and prior app engagement
PAID ACQUISITION — META
Meta Business Manager account setup and campaign build
App install campaigns targeting women 35–65 with menopause interest signals
Lookalike audience creation from installer data (typically at 100+ installs)
Weekly creative rotation and audience split testing
Placement optimization across Facebook Feed, Instagram Feed, Reels, and Stories
CREATIVE PRODUCTION
Video ad scripts for Meta Reels and Stories (15–30 seconds)
Static image ads for Meta Feed placements
Art direction for App Store and Google Play screenshot sets
Preview video script for App Store
All ad copy — headlines, descriptions, CTAs — written in Menovia's brand voice
Monthly creative refresh based on performance data
REPORTING & STRATEGY
Monthly performance report delivered by the 5th of each month
Installs, CPI, keyword rankings, creative performance, ad spend summary, scaling recommendations
AppTweak-powered ASO intelligence and competitor monitoring
Ad account access — Menovia owns all ad accounts and data at all times
10 — WHAT'S NOT INCLUDED
Scope clarity protects both of us.

The cleanest engagements are the ones with the clearest scope. This retainer is focused specifically on app growth and install marketing — everything below is outside the scope of this proposal. Any of it can be added under a separate agreement or as an expansion of this retainer.

ORGANIC SOCIAL & COMMUNITY
Organic Instagram, Facebook, Pinterest, or LinkedIn posting
Facebook or Instagram community management
Third-party community engagement (posting in external groups)
Influencer sourcing, outreach, or UGC campaign management
CONTENT & SEO
Blog articles or SEO content production
Blog outreach or backlink campaigns
Podcast pitching or PR outreach
Long-form editorial content
EMAIL MARKETING
Email sequence development or campaign management
Newsletter production or subscriber nurture flows
Welcome sequence design or optimization
PRODUCT & PLATFORM
In-app changes, product updates, or feature development
Website updates or landing page development
Platform bug fixes or maintenance
PASS-THROUGH COSTS NOT COVERED BY RETAINER
Apple Search Ads spend paid directly to Apple
Meta ad spend paid directly to Meta
AppTweak subscription paid directly to AppTweak
Any additional tooling or third-party service fees introduced during the engagement
11 — TERMS & NEXT STEPS
The fine print, in plain English.

RETAINER & BILLING
Management retainer of $750 per month is billed on subscription via autopay on the 1st of each month. Pass-through costs (ad spend and AppTweak) are billed directly to Menovia's own accounts at each platform. Cre8 Visions never handles pass-through funds — every dollar goes directly from Menovia to Apple, Meta, or AppTweak.
AD ACCOUNT OWNERSHIP
Menovia owns all ad accounts — Apple Search Ads, Meta Business Manager, and AppTweak. Cre8 Visions manages the accounts on Menovia's behalf but has no ownership claim on account access, data, campaigns, or historical performance information. If the engagement ends, Menovia keeps everything.
CONFIDENTIALITY
All information shared during the engagement — including performance data, business plans, financial details, and strategy — is treated as confidential. Cre8 Visions will not share, sell, or disclose Menovia's confidential information to any third party without written consent. This obligation continues indefinitely beyond the end of the engagement.
ONBOARDING
Onboarding begins within 5 business days of signed agreement and first retainer payment. First week: kickoff call, ad account access transfer, AppTweak setup, ASO audit begins. First 30 days: full ASO deployment and campaign launch.
REPORTING CADENCE
Monthly performance report delivered by the 5th of each month covering the prior month's performance. Report includes installs by platform, CPI trends, keyword rankings, creative performance, ad spend summary, and scaling recommendations.
GOVERNING LAW
This agreement is governed by the laws of the State of Georgia, USA. Any dispute that cannot be resolved through good-faith discussion is settled through mediation before any litigation is pursued.
12 — ACCEPTANCE
Let's get her found.

Signing below confirms acceptance of the scope, deliverables, retainer, pass-through structure, and terms outlined in this proposal.
Once signed, the first retainer invoice is issued, and onboarding begins within 5 business days of first payment. Campaign launch and ASO deployment happen inside the first 30 days.

FOR MENOVIA

 
Dr. Khadra Kahin
Founder, Menovia

 
Date
 | FOR CRE8 VISIONS

 
Tambria Kemp
Founder, Cre8 Visions

 
Date

CRE8 VISIONS
cre8visions.com · AI Business Architecture`;

export const EXEMPLARS: Exemplar[] = [
  {
    key: "menovia-retainer",
    name: "Menovia.ai — App Growth & Install Engine",
    kind: "marketing retainer",
    summary:
      "Monthly retainer for app store optimisation and paid install campaigns. Twelve sections, ~24,000 characters. Sent 20 Aug 2026.",
    text: MENOVIA_RETAINER,
  },
];

/** Index for the agent to choose from without reading anything in full. */
export function exemplarIndex(): Array<Omit<Exemplar, "text"> & { chars: number }> {
  return EXEMPLARS.map(({ text, ...rest }) => ({ ...rest, chars: text.length }));
}

/** Exact key first, then a loose match on kind or name. */
export function findExemplar(wanted: string): Exemplar | undefined {
  const w = wanted.trim().toLowerCase();
  if (!w) return undefined;
  return (
    EXEMPLARS.find((e) => e.key.toLowerCase() === w) ??
    EXEMPLARS.find((e) => e.kind.toLowerCase().includes(w) || w.includes(e.kind.toLowerCase())) ??
    EXEMPLARS.find((e) => e.name.toLowerCase().includes(w))
  );
}
