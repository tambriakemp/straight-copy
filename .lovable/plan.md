

## Plan: Align "AI · Brand · Vision" with "What We Do"

### Problem
The "AI · Brand · Vision" text at the bottom of the left sidebar is touching/overlapping the vertical accent line, while "What We Do" at the top is properly spaced.

### Fix

**File: `src/components/ServicesSection.tsx`** (line 19-21)

Change the "AI · Brand · Vision" `<p>` tag's `pl-6` to match the same left padding approach as "What We Do", and adjust positioning so it clears the line properly. Since this element has `rotate-180`, the padding direction is flipped — increase `pl-6` to `pl-8` or use `ml-6` to ensure it aligns consistently with "What We Do" above it.

Specifically, change line 19 from:
```
<p className="[writing-mode:vertical-rl] rotate-180 text-[10px] tracking-[0.3em] uppercase text-accent pl-6 whitespace-nowrap">
```
to:
```
<p className="[writing-mode:vertical-rl] rotate-180 text-[10px] tracking-[0.3em] uppercase text-accent pl-6 ml-5 whitespace-nowrap">
```

This adds a left margin to push the text away from the vertical line, aligning it visually with "What We Do".

