

## Plan: Move Navigation to Left Panel Only

### Problem
The navbar currently spans the full width of the hero (`left-0 right-0`), meaning the nav links on the right side sit over the dark hero images where `text-ink` has poor contrast.

### Solution
Constrain the navbar to only span the left half (the cream panel) on desktop, so all nav elements sit against the light background where `text-ink` is clearly readable.

### Changes

**File: `src/components/Navbar.tsx`**

- Change the `<nav>` container from `right-0` (full-width) to `md:right-1/2` so on desktop it only covers the left panel
- Keep `right-0` on mobile since the layout is single-column there
- Remove `mix-blend-multiply` for light variant (no longer needed since it's always on the cream bg)

The nav class would become:
```
absolute top-0 left-0 right-0 md:right-1/2 z-50 flex justify-between items-center px-8 md:px-[52px] py-7
```

This is a single-line change. If you don't like the look, it's easy to revert.

