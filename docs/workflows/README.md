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

| File | Installs as | Needs secrets |
|---|---|---|
| `ci.yml` | `.github/workflows/ci.yml` | none |
| `claude-queue-worker.yml` | `.github/workflows/claude-queue-worker.yml` | `CLAUDE_CODE_OAUTH_TOKEN`, `QUEUE_MCP_TOKEN`, `QUEUE_WORKER_GITHUB_TOKEN` |

`claude-queue-worker.yml` also has to be **on the default branch** before it can
be triggered at all: `repository_dispatch` silently returns 204 for a workflow
that does not exist there. Its own header documents the secrets and the Vault
route.
