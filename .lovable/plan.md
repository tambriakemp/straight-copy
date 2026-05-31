# Stage 5 — Automation 01 build plan (v3)

Replace `automation_01` with the new landing-page + lead-magnet + 5-email nurture system,
built into the client's SureContact account. Per-client credentials consist of **two values**
stored together in `project_secrets`:

- `surecontact_api_key` — used for REST (`api.surecontact.com`) **and** MCP auth (same `X-API-Key`)
- `surecontact_mcp_url` — the client's unique `https://mcp.surecontact.com/start/<slug>` URL

Execution model: REST API for lists/tags/automations/campaigns; **SureContact MCP for the
landing-page build** (Streamable HTTP — `Content-Type: application/json`,
`Accept: application/json, text/event-stream`, `X-API-Key: <key>`). On startup the
orchestrator calls `tools/list` against the MCP; if a landing-page create tool exists, it
runs step 7 automatically. If not, step 7 falls back to agency-manual using the copy +
brand snippet generated in step 6.

## New checklist (both `launch` and `growth`, stable keys under `automation_01.*`)

1. `lead_magnet_generated` — auto. Claude writes the PDF, uploads to Supabase storage, returns public URL.
2. `surecontact_api_key_added` — agency. Drops the client's SureContact API key into the task as a per-project secret. Gates everything below.
3. `surecontact_list_created` — auto. Creates `[Business Name] Leads` list + tags (`new-lead`, `lead-magnet-delivered`, `qualified`, `not-a-fit`, `converted`, `nurture`) via the existing `/contacts/upsert` flow + a setup helper that pre-seeds them with a stub contact, then removes the stub.
4. `nurture_emails_written` — auto. Claude writes all 5 emails in client brand voice. Output is **rich, branded HTML** using the client's brand kit (colors, fonts, logo, one-liner), not plain text.
5. `nurture_sequence_built` — auto. Best-effort: try to create a SureContact automation triggered by the `new-lead` tag. If the create-automation endpoint isn't exposed on this account, fall back to 5 individually-scheduled Campaigns (the visible `/campaigns` POST endpoint supports full HTML body + scheduling).
6. `landing_page_assets_generated` — auto. Orchestrator generates a branded landing-page copy block (headline, subhead, bullets, CTA) + a brand-kit snippet (colors, fonts, logo URL, lead-magnet name) as a downloadable asset on the task.
7. `landing_page_built` — agency. Manual: agency builds the landing page in SureContact's UI using the generated copy + brand snippet from task 6, then drops the published URL into the task's `url` field. Acceptance criteria: landing page live + URL pasted on task.
8. `flow_tested` — agency. Manual test opt-in; confirm email 1 fires with working lead-magnet link.
9. `landing_page_sent_to_client` — auto (on completion of #7). Sends landing-page URL to client via the existing transactional email scaffolding.

## Per-client SureContact API key — `project_secrets` table

New table:

```sql
CREATE TABLE public.project_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id uuid NOT NULL REFERENCES public.client_projects(id) ON DELETE CASCADE,
  key text NOT NULL,
  encrypted_value bytea NOT NULL,        -- pgp_sym_encrypt with PROJECT_SECRETS_KEY env
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_project_id, key)
);
GRANT ALL ON public.project_secrets TO service_role;
-- no anon / authenticated grants; admin reads happen through edge function
ALTER TABLE public.project_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read project_secrets metadata"
  ON public.project_secrets FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "service role manages project_secrets"
  ON public.project_secrets FOR ALL TO public
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
```

UI: new `AddSureContactKeyDialog` triggered from the `surecontact_api_key_added` task.
Writes through new `add-project-secret` edge function (admin auth required, never returns
plaintext after save). Orchestrator decrypts via `pgp_sym_decrypt` server-side only.

A new secret `PROJECT_SECRETS_KEY` (random 32 bytes, hex-encoded) gates encryption.

## Backend changes

**Migration**
- Replace `journey_templates` rows for `launch:automation_01` and `growth:automation_01` with the 9-item checklist above; run `syncChecklist` against existing nodes to preserve `done` state.
- New `ensure_automation_01_tasks_for_project(_id uuid)` (mirrors `ensure_brain_setup_tasks_for_project`).
- Extend `ensure_stage_tasks_on_node_insert` to call it for `key='automation_01'`.
- Bidirectional triggers `sync_automation_01_tasks_from_journey` / `sync_automation_01_journey_from_task`.
- `trg_automation_01_in_progress` → `fire_automation_01_build(_client_project_id)` (pg_net POST).
- `project_secrets` table + RLS as above.
- Backfill: re-run ensure-function for existing automation_build projects.

**Edge functions**
- `build-automation-01/` (new orchestrator, `verify_jwt = false` for pg_net).
  Steps 1, 3, 4, 5, 6, 9 are automated; steps 2, 7, 8 are agency tasks the orchestrator
  monitors but does not complete. Each automated step writes a `project_task_activity`
  row + flips the task to `complete`. Storage uses existing `client-deliverables` bucket.
- `add-project-secret/` (`verify_jwt = true`, admin-gated) for the secret-input modal.
- Update `supabase/config.toml` accordingly.

**Prompts (`build-automation-01/prompts.ts`)**
- `LEAD_MAGNET_PROMPT` — 1-page branded PDF.
- `NURTURE_EMAIL_PROMPTS` — 5 prompts producing **rich, on-brand HTML emails** (welcome+delivery, quick win, founder story, social proof, soft CTA). Each prompt loads brand kit (primary + accent hex, heading + body font, logo URL) and instructs Claude to return a complete HTML email body with inlined styles, a hero band using `--primary`, branded button, footer with one-liner, and a `{{lead_magnet_url}}` placeholder for email 1. Quality bar: editorial, not a generic transactional shell.
- `LANDING_PAGE_COPY_PROMPT` — headline/subhead/bullets/CTA copy + a markdown brand snippet (colors, fonts, logo URL, lead-magnet name) for the agency to paste into SureContact's landing-page builder.

## Frontend changes

- `AddSureContactKeyDialog` on the `surecontact_api_key_added` task.
- Admin project detail: "Automation 01" card showing lead-magnet PDF link, landing-page-asset download, landing-page URL (once agency pastes it), and "Re-run build" button.
- Portal `PortalProject.tsx`: show landing-page URL + lead-magnet download once `landing_page_sent_to_client` is complete.

## Rollout

1. Add `PROJECT_SECRETS_KEY` secret.
2. Apply migration (templates + ensure fn + triggers + `project_secrets` table + backfill).
3. Deploy `build-automation-01` and `add-project-secret`.
4. Add `AddSureContactKeyDialog` + task action button.
5. End-to-end test on the current Cre8 Visions client.

## Open items

- The visible SureContact API docs only show Automations (list/show/start), Campaigns (full CRUD), Companies, and contacts/upsert. If the create-automation endpoint exists in the unvisible portion of the docs, we use it; if not, we fall back to scheduled Campaigns. Either way the orchestrator returns success.
- A SureContact MCP for landing-page CRUD would let us remove the agency-manual step 7 once available; the checklist is structured so that swap is a one-task change.
