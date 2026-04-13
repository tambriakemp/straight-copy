

## Plan: Font Readability Enhancements + Location Update

### 1. Change "Fort Worth, Texas" to "Atlanta, Georgia"
- **File**: `src/pages/Contact.tsx` line 113

### 2. Font Readability Issues Found

After reviewing all pages, here are the areas where text is too small or too light to read comfortably:

**Across multiple pages — subheading labels still at `text-[10px]`:**
- `src/components/ContactSection.tsx` line 9: "Ready When You Are" — `text-[10px]`
- `src/components/ProcessSection.tsx` line 13: "How It Works" — `text-[10px]`
- `src/pages/Philosophy.tsx` lines 50, 72, 89, 122, 153, 176: multiple subheadings still `text-[10px]`

These should be bumped to `text-[11px]` to match the rest of the site.

**Body text using `text-taupe` on dark backgrounds (low contrast):**
- `src/components/ProcessSection.tsx` line 27: step descriptions — `text-taupe` on white bg is borderline; bump to `text-charcoal`
- `src/pages/Philosophy.tsx` line 110: pillar body text — `text-taupe` on dark charcoal bg is hard to read; bump to `text-stone`
- `src/pages/Philosophy.tsx` line 94: pillar intro text — same issue
- `src/pages/Philosophy.tsx` line 165: ethics body text — `text-taupe` on light bg; bump to `text-charcoal`
- `src/pages/Philosophy.tsx` line 131: manifesto closing — `text-taupe`; bump to `text-charcoal`

**Work section card tags:**
- `src/components/WorkSection.tsx` line 42: project tags at `text-[10px]` with `text-warm-white/60` — very hard to read; bump to `text-[11px]` and `text-warm-white/70`

**Hero section body text:**
- `src/components/HeroSection.tsx` line 18: body paragraph at `text-[13px] text-taupe` — bump to `text-[14px]` for better readability
- `src/pages/Philosophy.tsx` line 95 contact description at `text-[13px] text-taupe` — bump to `text-[14px]`

**Footer:**
- `src/components/Footer.tsx`: links at `text-[11px]` are fine, but the copyright text at `text-taupe` could be slightly lighter for hierarchy (no change needed)

**Rotated side text:**
- `src/components/HeroSection.tsx` line 52: `text-[9px]` — decorative, acceptable

### Summary of Changes

| File | What | Change |
|------|------|--------|
| Contact.tsx | Location | "Fort Worth, Texas" → "Atlanta, Georgia" |
| ContactSection.tsx | Subheading | `text-[10px]` → `text-[11px]` |
| ProcessSection.tsx | Subheading + descriptions | `text-[10px]` → `text-[11px]`, descriptions `text-taupe` → `text-charcoal` |
| Philosophy.tsx | 6 subheadings | `text-[10px]` → `text-[11px]` |
| Philosophy.tsx | Body text contrast | Bump taupe text to stone (dark bg) or charcoal (light bg) |
| WorkSection.tsx | Card tags | `text-[10px]` → `text-[11px]`, opacity 60% → 70% |
| HeroSection.tsx | Body paragraph | `text-[13px]` → `text-[14px]` |

