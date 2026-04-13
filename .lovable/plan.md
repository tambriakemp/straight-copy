

## Plan: Move Tagline to the Scrolling Marquee Bar

### What
Add "Real Light", "Real Texture", and "AI Crafted" to the marquee strip items and remove the vertical text from the hero section.

### Changes

**File: `src/components/MarqueeStrip.tsx`**
- Add the three phrases to the `items` array:
```ts
const items = [
  "AI Brand Campaigns", "Editorial Imagery", "Lifestyle Content",
  "Short-Form Video", "Product Visualization", "Brand Strategy",
  "Real Light", "Real Texture", "AI Crafted",
];
```

**File: `src/components/HeroSection.tsx`**
- Remove the vertical text div (the `absolute -right-5 top-1/2 ...` element near the bottom of the image grid)

