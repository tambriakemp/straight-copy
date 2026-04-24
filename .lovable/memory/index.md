# Project Memory

## Core
- Editorial luxury: cream/stone/ink/taupe palette. Cormorant Garamond & Karla fonts.
- Base font 16.5px. Editorial body 14px. Subheadings 11px uppercase (0.35em tracking).
- Navbar must be absolute top (never fixed/sticky). Light variant constrained to left half on desktop.
- All brand and portfolio imagery is AI-produced.
- Core interactions: custom ring-follower cursor and reveal-on-scroll animations.
- Official socials: Instagram & LinkedIn only. NEVER add Behance.
- Form submissions and emails use Supabase Edge Functions to proxy SureContact API.
- Site has NO portfolio/work page. The /work route is removed; /how-it-works replaces it. Never re-add a work/portfolio page.

## Memories
- [Global Aesthetic](mem://style/aesthetic) — Core color palette, fonts, and image sourcing
- [Button Styling](mem://style/buttons) — Transparent background and subtle border for dark-theme CTA buttons
- [Page Header Layouts](mem://style/page-headers) — Specific padding and watermark positioning for core pages
- [Typography Details](mem://style/typography-details) — Specific font sizes, tracking, and contrast rules
- [Interactive Patterns](mem://ui/interactive-patterns) — Custom ring-follower cursor and reveal-on-scroll animations
- [Homepage Work Section](mem://ui/work-section-home) — Flex-based growing layout on hover
- [Services Logic](mem://features/services) — Pricing tiers, sidebar layout, and CTA routing
- [Contact Page](mem://features/contact-page) — Split-panel layout, HELLO watermark, post-submission routing
- [Privacy Policy](mem://features/privacy-policy) — Editorial numbered layout with dark ink background
- [Navigation Constraints](mem://architecture/navigation) — Absolute navbar, light variant constraint, ScrollToTop
- [SureContact Integration](mem://integrations/surecontact) — Upsert proxy via Supabase Edge Function
- [Transactional Email](mem://integrations/email-system) — Supabase Edge Functions + React Email, notify.cre8visions.com
- [Social Constraints](mem://features/social-presence) — Limited to IG and LinkedIn, explicitly no Behance
- [Brand Assets & SEO](mem://brand/assets-and-seo) — Favicons, OG metadata, and SEO description
