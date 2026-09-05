# Workflows waiting to be installed

The GitHub App that opens pull requests here cannot write to
`.github/workflows/` — GitHub requires a separate `workflows` permission for
that, and refuses the push outright:

```
refusing to allow a GitHub App to create or update workflow
`.github/workflows/ci.yml` without `workflows` permission
```

So workflow files land here first, and a human moves them. It is a copy, not an
edit — nothing in them needs changing.

## Installing one

Either ask Claude Code to do it:

```
git mv docs/workflows/ci.yml .github/workflows/ci.yml
git commit -m "Install CI workflow" && git push
```

…or in the GitHub web UI: **Add file → Create new file**, name it
`.github/workflows/ci.yml`, and paste the contents of the file in this folder.
Committing through the web UI is you, not the App, so the permission does not
apply.

## Files

Nothing is waiting right now — `ci.yml` and `claude-queue-worker.yml` were both
installed in `7f0381a`. Do not look for them here; edit them under
`.github/workflows/` like any other file.

This folder stays because the App's restriction has not gone away: the next
workflow I write will land here too, and this page explains why a file appears in
a documentation directory instead of where it belongs.
