

## Plan: Improve Navbar Visibility on Homepage

### Problem
The navigation menu on the homepage uses `text-charcoal` (a mid-tone gray) which lacks sufficient contrast against the light background, making it hard to see.

### Solution
Change the nav link color from `text-charcoal` to `text-ink` (the darkest palette color) for the light variant of the navbar.

### Changes Required

**File: `src/components/Navbar.tsx`**

| Line | Current | Change |
|------|---------|--------|
| 42 | `text-charcoal hover:text-accent` | `text-ink hover:text-accent` |
| 71 | `text-charcoal hover:text-accent` | `text-ink hover:text-accent` |

This will make both desktop nav links and mobile menu links significantly more visible on light backgrounds while maintaining the dark variant styling unchanged.

