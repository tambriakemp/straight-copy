## Goal
Replace the current `src/pages/Philosophy.tsx` (which is the old "Cre8 Visions / We believe in what's real" creative-content version) with the new business-architecture version from the uploaded `Cre8_Visions_Philosophy.html`, matching copy, structure, and styling exactly while keeping the page integrated with the React/Tailwind/Router app.

## Scope of changes

### File: `src/pages/Philosophy.tsx` (full rewrite of body)
Keep existing scaffolding (Navbar, Footer, custom cursor hooks, scroll reveal, scroll-to-top), and replace all section content with the new structure.

**Hero**
- Eyebrow: "Our Philosophy"
- Headline (3 lines): `We believe your` / `business should` / `<em>run without you.</em>`
- Background watermark word: `Architect.` (centered, ~22vw, 4% white opacity, italic)
- Left vertical accent gradient line + scroll indicator on bottom-right (unchanged behavior)

**Opening section (cream, 2-col)**
- Left: blockquote — *"You didn't start a business to spend your days doing tasks a machine could handle. **You started it to build something that matters.**"* — attribution `— Cre8 Visions`
- Right: eyebrow `Where We Come From` + 3 paragraphs of new "burn out / AI changed what's possible / architect the system" copy

**Pillars section (ink, 2x2 grid)**
Replace all 4 pillars with:
1. `Systems` over hustle
2. `Ownership` over dependency
3. `Intelligence` that compounds
4. `Access` for every business

Header intro changes to: "Four beliefs that shape every system we build — and every decision we make about how to build it."

**Manifesto section (cream, centered)**
Replace 2 manifesto paragraphs + closing with the 3 new manifesto paragraphs ("future of business is not about working more", "architects, not vendors", "businesses that win the next decade") plus closing line "That infrastructure is what we build…"

**Stats strip (accent background, 4 cols)**
Replace stats with:
- `2` — Core automations every client gets
- `3` — Monthly deliverables that compound
- `0` — Tech knowledge required from you
- `∞` — The system has no ceiling

**"Our Approach to AI" section (warm-white, sticky-title 2-col)**
- Eyebrow becomes `How We Work` (was "Transparency")
- Title becomes `Our Approach to AI` (already matches)
- Replace all ethics items with the 5 new ones:
  1. We design before we build
  2. We're transparent about what AI can and can't do
  3. We stay ahead so you don't have to
  4. We build for your voice, not a generic one
  5. We measure success by your results — not our activity

**CTA section (ink, centered)**
- Watermark: change `REAL.` → `THINK.`
- Eyebrow: `The Architecture Starts Here`
- Headline: `Same belief.` / `Different business.` / `<em>Every time.</em>`
- Buttons: Primary `Start the Architecture` → `/contact`; Ghost `See what we build` → `/services` (was `/how-it-works`)

### Styling notes
- Continue using existing palette tokens (`bg-ink`, `bg-cream`, `text-warm-white`, `text-stone`, `text-accent`, `text-taupe`, `text-charcoal`, `border-mist-custom`, `bg-sand`, etc.) — matches the source CSS variables 1:1.
- Continue using Cormorant Garamond (`font-serif`) and Karla (default sans). All `font-light`, italic emphasis on `<em>`.
- Keep `clamp()` font sizes inline-styled where Tailwind can't express them (already a pattern used in the existing file).
- Keep `reveal` / `reveal-delay-*` classes for scroll animation (already wired via `useScrollReveal`).
- Hover behavior on pillars (left accent bar grows, bg shifts to `#221F1C`) — preserve existing implementation.

### Files NOT changed
- `src/components/PhilosophySection.tsx` (homepage section) — request is specifically about the Philosophy page.
- `src/App.tsx` routing — `/philosophy` already mounts `Philosophy.tsx`.
- Navbar / Footer / hooks — unchanged.

## Out of scope
- No copy changes to other pages.
- No new routes or components.
- No design-system token additions (existing tokens cover everything in the reference HTML).
