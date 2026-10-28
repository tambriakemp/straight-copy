# Admin IA reorganization

- [x] Replace `/admin` agent dashboard with client-first status strip and roster
- [x] Add per-client proposal, balance, and preview status badges
- [x] Add all-client Proposals and Payments pages
- [x] Promote Social/Marketing to `/admin/social`
- [x] Rework desktop and mobile navigation
- [x] Verify typecheck and tests

# Client portal sign-in (PR #112) and client screens

- [x] Apply portal sign-in database changes (+ missing access grant) and the 15-minute health check
- [x] Deploy the portal-facing functions changed by PR #112
- [x] Deploy `client-portal` with `_shared/` (from origin/main, byte-identical)
- [ ] Publish the frontend — blocked: the new client screens (PRs #114–#118) are on GitHub main but not yet in this checkout; needs the GitHub sync, then Publish
- [ ] Client "rebuilds and approvals" screen — blocked on the user: rebuilds/approvals today belong to prospects, none linked to a client
