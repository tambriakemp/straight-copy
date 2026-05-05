# Typography scale-up

Right now the body sits at 16.5px and the admin/CRM surfaces (Previews, Preview Detail, Client Detail, Dashboard, Profile, Tokens, Invites) lean heavily on 10–13px text — fine on a 4K screen, cramped at 1440px. We'll raise the floor everywhere without breaking the editorial rhythm (Cormorant serif headlines, Karla body, uppercase 0.35em micro-labels).

## Goals
- Lift the smallest readable text from 10–11px to 12–13px.
- Push body copy from 13–14px to 15–16px in admin surfaces.
- Keep large serif headlines roughly the same — they already read well.
- Preserve uppercase tracking labels but at a slightly larger size so they're scannable.
- Update the project memory so future work follows the new scale.

## New scale (semantic)

```text
Micro / eyebrow (uppercase 0.3em)   10  -> 12
Caption / meta                      11  -> 13
Body small                          12  -> 14
Body                                13  -> 15
Body large                          14  -> 16
Subhead                             15-16 -> 17-18
Section title (serif)               20-22 -> 24-26
H1 page title (serif clamp)         (kept; already 38-72)
```

Base `body` font-size in `src/index.css` goes from `16.5px` to `17px`.

## Files to update

### Global stylesheet — `src/index.css`
- `body` 16.5 -> 17.
- `.crm-shell` everywhere: bump every `font-size: 10px/11px/12px/13px/14px/15px` rule one tier per the table above. Specifically:
  - Top nav items, sign-out, eyebrows, labels, table headers, badges: 10/11 -> 12/13.
  - `.crm-btn` 11 -> 13; `.crm-btn--sm` 10 -> 12.
  - `.roster__sub` 14 -> 16; `.roster__name` 20 -> 22; `.roster__email` 12 -> 14; `.roster__stage` 16 -> 18; `.roster__days` 28 -> 32.
  - `.detail__client-name` 22 -> 26; meta 10 -> 12; `.detail__progress-fraction` 30 -> 34.
  - `.crm-checkitem__label` 13 -> 15; `.crm-notes-area` 13 -> 15; placeholders 14 -> 16.
  - `.crm-modal__desc` 14 -> 16; `.crm-modal__meta-item .val` 18 -> 20.
  - Mobile media query overrides updated proportionally.
- Tracking on uppercase labels stays the same (looks correct).
- Serif clamp titles (`roster__title`, `crm-modal__title`, etc.) stay as-is.

### Admin screens with inline `fontSize` (~100 occurrences)
Sweep these and bump each numeric to the new scale per the mapping table:
- `src/pages/admin/PreviewDetail.tsx`
- `src/pages/admin/Previews.tsx`
- `src/pages/admin/ClientDetail.tsx`
- `src/pages/admin/Dashboard.tsx`
- `src/pages/admin/Profile.tsx`
- `src/pages/admin/Tokens.tsx`
- `src/pages/admin/Invites.tsx`
- `src/pages/admin/ResetPassword.tsx`
- `src/pages/admin/AdminLogin.tsx`
- `src/components/admin/AdminLayout.tsx`
- Portal admin sub-components (`AccountAccessSection`, `ContractSection`, `SubscriptionSection`, `AdminContractSection`).

Rule of thumb applied:
- 9 -> 11, 10 -> 12, 11 -> 13, 12 -> 14, 13 -> 15, 14 -> 16, 15 -> 17, 16 -> 18, 18 -> 20, 20 -> 22, 22 -> 26, 24 -> 28, 28 -> 32.
- Anything ≥ 38 (page H1s) left alone.

### Public marketing site (light pass)
The marketing site already breathes well at the new 17px base, but a few hardcoded small bits get nudged for parity:
- Footer links / legal copy 12 -> 13.
- Form helper text 12 -> 14.
- No changes to hero serifs, marquee, or service cards.

### Preview feedback widget — `supabase/functions/preview-serve/index.ts`
The injected pin/feedback modal lives in client sites, so we'll bump it too:
- Form labels 12 -> 13, inputs 14 -> 15, buttons 13 -> 14, pin number 13 -> 14.

## Memory update
Update the Core memory line in `mem://index.md`:
- "Base font 17px. Editorial body 15px. Subheadings 12px uppercase (0.35em tracking)."
- Refresh `mem://style/typography-details` with the new scale table.

## Out of scope
- No color, spacing, or layout changes.
- Shadcn primitives (`src/components/ui/*`) untouched — they inherit from body.
- No new design tokens; this is a values-only sweep.

## QA
After the sweep, walk the app at 1440 viewport: Previews list, Preview Detail (both tabs), Dashboard, a Client Detail page, marketing home, and the public preview viewer. Confirm nothing wraps awkwardly or breaks alignment in the editorial header areas.
