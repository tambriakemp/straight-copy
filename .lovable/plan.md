

## Plan: Make Selected Work Cards Fill Available Width

### Problem
The four work cards have fixed widths (`w-[320px]`) so on wider screens they cluster on the left with a large empty gap on the right.

### Solution
Switch from fixed-width cards to flexible cards that grow to fill the container. Each card will take an equal share of the available space using `flex-1` with a `min-w-0` base width, and expand slightly on hover.

### Changes

**File: `src/components/WorkSection.tsx`** (line 25-29)

- Change the card container from `overflow-x-auto` to a simple flex row (no horizontal scroll needed since cards will fit)
- Change each card from `flex-shrink-0 w-[320px]` to `flex-1 min-w-0` so they distribute evenly
- Keep the hover expand effect by switching to a hover width via `hover:flex-[1.3]` instead of a fixed pixel width
- Remove `pb-6` (was for scrollbar spacing)

The card class becomes:
```
work-card flex-1 min-w-0 h-[420px] relative overflow-hidden transition-all duration-500 hover:flex-[1.3] group
```

The container class becomes:
```
work-scroll flex gap-[2px]
```

This ensures the cards always span the full width regardless of screen size.

