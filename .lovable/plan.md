

## Plan: Match Homepage Exactly to the Cre8 Visions Design System

The current homepage has the right sections but several elements don't match the supplied design system mockup. I'll rewrite each section component (and the navbar/footer) so the page is a 1:1 React/Tailwind translation of the HTML reference.

### Changes per component

**1. `Navbar.tsx`**
- Switch from `absolute` to `fixed` positioning (the mockup uses a fixed translucent bar over the dark hero).
- Always render with the dark blurred background `bg-ink/75 backdrop-blur-[14px]` regardless of variant — the mockup nav is always dark.
- Remove the `md:right-1/2` light-variant constraint for the homepage. (Other pages can keep light variant by overriding.)

**2. `HeroSection.tsx` (full rewrite)**
- Remove the 4-cell blueprint grid on the right entirely.
- Single full-width centered hero with max-width 980px content block:
  - Eyebrow with leading 36px line + "AI Business Architecture"
  - Headline `clamp(64px, 9vw, 132px)` — "We architect the AI systems that run your *business.*" (only "business." italic on its own line)
  - Sub paragraph at 19px / stone color
  - CTA row: "Start the Process" (primary) + "See What We Build" (ghost with arrow)
- Watermark: giant italic "CV" at bottom-right (520px, 2.5% white opacity).
- Hero padding `160px 0 120px`, min-height 100vh.

**3. `MarqueeStrip.tsx`**
- Items rendered in serif italic (Cormorant Garamond) at 17px instead of current sans/14px.
- Slower animation (28s instead of 20s).

**4. `ProblemSolutionSection.tsx`**
- Add eyebrow leading-line treatment (36px horizontal line before label).
- Increase paddings to `140px 72px`, body text to 17px, headline to clamp(40px, 4.2vw, 58px).
- Use grid layout `32px 1fr` for the icon + text rows.

**5. `ServicesSection.tsx` (rename heading + restyle)**
- Centered section header (eyebrow with lines on both sides, large centered title, intro paragraph) — replaces current left-aligned 2-col header.
- Two automation cards with the hover effect: card flips from cream → ink on hover (text colors invert). Top accent line scales in on hover.
- "Need something more?" upcharge row: separate block below grid with `border-top: 2px solid accent`, two-column `1fr 1.4fr` layout, tag pills in warm-white with sand border.

**6. `MonthlyValueSection.tsx`**
- Centered section header (eyebrow with double lines, centered title + intro).
- Three cards on dark bg. Card hover changes the giant "01/02/03" numeral from faint white to accent color.
- Time pill becomes a small caps line with top border, not a separate accent row.

**7. `PhilosophySection.tsx` (Architect)**
- Add eyebrow leading-line treatment.
- Stats grid: 4 cells, each `padding: 56px 44px`, large numerals at 88px, label at 13px tracking 0.14em.

**8. `ProcessSection.tsx`**
- Header layout matches: eyebrow + left-aligned title on the left, "Begin yours" ghost link on the right (already close, minor tweaks).
- Step cards: number at 88px in `sand` color (not mist), step title at 26px serif, hover changes border-top to accent and bg to warm-white.

**9. `ContactSection.tsx` (CTA)**
- Centered eyebrow with double leading lines + "Ready to Build" label.
- Headline "Stop running your business manually. *Architect it.*" at clamp(56px, 7vw, 108px).
- Two CTAs: primary "Start the Architecture" + ghost "See What We Build".
- Giant "ARCHITECT" watermark behind (260px, 2% white opacity).

**10. `Footer.tsx`**
- Match mockup: charcoal background, three-column flex (logo / copyright / links), padding `48px 64px`.
- Already very close — only spacing/typography fine-tunes needed.

**11. `index.css` / global helpers**
- Update marquee animation duration to 28s (or override per-component).
- Add a `.reveal` opacity/transform pattern is already present.
- The `useScrollReveal` hook is already wired — keep it.

### What stays the same
- Color tokens (cream, ink, accent, stone, taupe, etc.) — already match the mockup hex values.
- Font families (Cormorant Garamond + Karla) — already loaded.
- Section ordering: Hero → Marquee → Problem/Solution → Services → MonthlyValue → Philosophy → Process → Contact → Footer (already matches).
- `useCustomCursor` and `useScrollReveal` hooks — kept.
- Routes and other pages — unchanged.

### Files touched
- `src/components/Navbar.tsx`
- `src/components/HeroSection.tsx`
- `src/components/MarqueeStrip.tsx`
- `src/components/ProblemSolutionSection.tsx`
- `src/components/ServicesSection.tsx`
- `src/components/MonthlyValueSection.tsx`
- `src/components/PhilosophySection.tsx`
- `src/components/ProcessSection.tsx`
- `src/components/ContactSection.tsx`
- `src/components/Footer.tsx`
- `src/index.css` (minor — marquee speed + any new utility)

### Note
Because the navbar is shared across all pages, switching it to always-dark/fixed will affect other pages too. If you want to preserve the current light navbar look on `/services`, `/philosophy`, `/contact`, etc., I can keep the `variant` prop and only change the dark variant to match the mockup (recommended). Let me know if you'd rather have the dark fixed nav on every page.

