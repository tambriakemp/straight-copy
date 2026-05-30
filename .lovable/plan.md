# Stage 5 — Automation 01 build plan

Replace the current "inquiry channel / Ottokit" automation_01 with the new landing-page + lead-magnet + 5-email nurture system, built into the *client's* SureContact account using a per-client API key supplied by the agency. Mirrors the brain_setup pattern: a journey node + tasks epic + an edge function orchestrator that runs end-to-end when the agency starts the stage.

## New checklist (both `launch` and `growth`)

Stable keys under `automation_01.*`:

1. `lead_magnet_generated` — auto. Claude writes the PDF, uploads to Supabase storage, returns public URL.
2. `surecontact_api_key_added` — agency. Drops the client's SureContact API key into the task as a per-project secret. Gates everything below.
3. `surecontact_list_created` — auto. Creates `[Business Name] Leads` list + 6 tags (`new-lead`, `lead-magnet-delivered`, `qualified`, `not-a-fit`, `converted`, `nurture`).
4. `landing_page_built` — auto. Builds branded opt-in page (colors/fonts/one-liner/lead-magnet name) in client SureContact, hosted on SureContact's domain. Saves URL to the task.
5. `nurture_emails_written` — auto. Claude writes all 5 emails in client brand voice using QRC + ICP + offer suite.
6. `nurture_sequence_built` — auto. 5-email sequence assembled in SureContact with proper send-cadence.
7. `optin_workflow_built` — auto. Form submit → tag `new-lead` → enroll in sequence → deliver lead magnet on email 1.
8. `flow_tested` — agency. Manual test opt-in; confirm email 1 fires with working lead-magnet link.
9. `landing_page_sent_to_client` — auto. Sends landing-page URL to client via SureContact (existing email scaffolding).

## Per-client SureContact API key

The existing `SURECONTACT_API_KEY` env var is the *agency* key. We need a per-client store. Proposed: new `project_secrets` table (`client_project_id`, `key`, `encrypted_value` via `pgcrypto`/Vault, `created_by`, RLS admin-only). UI: a new "Add SureContact API key" affordance on the `surecontact_api_key_added` task that opens a secret-input modal and writes through an edge function (no plaintext to the frontend after save). Orchestrator reads it via service role + decrypt.

Alternative if you'd rather keep it simple: a single `clients.surecontact_api_key_encrypted` column. I'll go with the table approach so future per-project secrets (Claude key, etc.) have a home — but happy to swap if you prefer the column.

## Backend changes

**Migration**
- Update `journey_templates` rows for `launch:automation_01` and `growth:automation_01` to the 9-item checklist above; run `syncChecklist` against existing nodes to preserve `done` state.
- New `ensure_automation_01_tasks_for_project(_id uuid)` (mirrors `ensure_brain_setup_tasks_for_project`) — creates the `5. Automation 01` epic + 9 mirrored tasks; idempotent. Includes acceptance criteria for the agency tasks (`surecontact_api_key_added`, `flow_tested`).
- Extend `ensure_stage_tasks_on_node_insert` to call it for `key='automation_01'`.
- Add bidirectional triggers `sync_automation_01_tasks_from_journey` / `sync_automation_01_journey_from_task` (clones of the brain_setup pair, filtered on `automation_01.%`).
- New `trg_automation_01_in_progress` trigger that fires `fire_automation_01_build(_client_project_id)` when the node flips to `in_progress` AND the API-key task is complete (orchestrator also rechecks before running).
- New `fire_automation_01_build` SQL function — `pg_net` POST to the new edge function (same shape as `fire_brain_artifacts_generation`).
- New `project_secrets` table with `pgcrypto` encryption; RLS: admin-only read/write; service_role full.
- Backfill: re-run ensure-function for every existing automation_build project that already has the automation_01 node.

**Edge functions**
- `build-automation-01/` (new orchestrator).
  - Inputs: `clientProjectId`.
  - Loads `clients.intake_data`, brand voice doc text, brand kit (colors, fonts, logo), offer suite + ICP from previously-generated brain artifacts (read from storage like the brain-setup chain), and the client's SureContact API key from `project_secrets`.
  - If API key missing → bail with clear error, leave task open.
  - Step 1: Generate lead-magnet PDF via Claude (uses existing `prompts.ts` pattern + `pdf.ts` renderer). Upload to `client-deliverables` bucket; record activity on the task with attachment.
  - Step 2–7: Call SureContact REST (per-client key) to create list, tags, landing page (templated HTML using brand kit colors/fonts/one-liner/lead-magnet name), draft each of 5 emails (Claude in brand voice, using ICP + offer suite + lead-magnet topic), assemble sequence, build opt-in workflow.
  - Each step writes a `project_task_activity` row and flips the corresponding task to `complete` (uses the journey-sync trigger).
  - On success: stores landing-page URL on the `landing_page_built` task `url` field and on a new `client_projects.automation_01_landing_url` column for portal display.
  - Step 9 fires SureContact transactional email to client with landing-page URL.
- New `add-project-secret/` function for the secret-input modal (admin auth required, writes encrypted row).
- `supabase/config.toml`: `verify_jwt = false` for `build-automation-01` (called from pg_net) and `verify_jwt = true` for `add-project-secret`.

**Prompts**
- New `supabase/functions/build-automation-01/prompts.ts` with:
  - `LEAD_MAGNET_PROMPT` — 1-page PDF in brand voice, title formula "5 Ways to [Outcome] Without [Frustration]", uses `lead_magnet`, `customer_outcome`, `customer_struggles`, `business_one_liner`, `tone_words`.
  - `NURTURE_EMAIL_PROMPTS` — 5 individually-tuned prompts (welcome+delivery, quick win, founder story, social proof, soft CTA) all loading brand voice + offer suite + ICP context.
  - `LANDING_PAGE_COPY_PROMPT` — headline/subhead/bullets/CTA copy for the SureContact landing page.

## Frontend changes

- `Stage` ordering: no UI change needed; tasks panel + activity log already render the new epic.
- New `AddSureContactKeyDialog` triggered from the `surecontact_api_key_added` task action button (admin-only). Uses `add-project-secret` edge function.
- Admin project detail: small "Automation 01" card showing landing-page URL, lead-magnet PDF link, and "Re-run build" button (calls orchestrator with `force=true`).
- Portal `PortalProject.tsx`: show landing-page URL + lead-magnet download once `landing_page_sent_to_client` is complete.

## Storage

- Reuse existing `client-deliverables` bucket for `lead-magnets/<projectId>/<slug>.pdf` (public-read signed URLs).
- Landing-page assets (if any uploads beyond what SureContact hosts) live in the same bucket under `automation-01/<projectId>/`.

## Rollout

1. Apply migration (templates + ensure fn + triggers + `project_secrets` table + backfill).
2. Deploy `build-automation-01` and `add-project-secret` functions.
3. Add `AddSureContactKeyDialog` + task button.
4. End-to-end test on the current Cre8 Visions client: paste API key → flip node to in_progress → confirm all 9 tasks auto-complete and email lands.
5. Once green, hand-off pattern is identical for Automation 02 later.

## Open assumption to confirm

I'm proposing a `project_secrets` table for the per-client SureContact API key (cleanest, reusable). If you'd rather keep it on `clients` as a single encrypted column for now, say the word and I'll swap that part of the migration before building.
