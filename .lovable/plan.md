## Increase contract font sizes for readability

Update contract document typography in `src/index.css` (used by both client portal and admin contract views):

- `.portal-contract__doc-title`: 22px → 26px
- `.portal-contract__doc-meta`: 15px → 16px
- `.portal-contract__section-heading`: 17px → 19px
- `.portal-contract__section-body`: 13.5px → 16px (main fix — body copy is the hardest to read), line-height 1.6 → 1.7
- `.portal-contract__doc` max-height: 420px → 520px (so the larger text still has room to breathe before scrolling)

No component logic changes; CSS only.