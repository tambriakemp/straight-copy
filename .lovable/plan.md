## Goal

New project type **App Development**. Admin uploads a proposal/contract PDF on the project page. Client sees it in the portal, signs (typed or drawn), and a countersigned signed PDF is produced and shown in both portal and admin. Multiple proposals per project (revisions, change orders) are supported, each independently signable.

## Scope

- New `client_projects.type = 'app_development'`
- Admin upload + manage proposals on the project page
- Portal section listing all proposals for the client's app dev projects, with sign flow
- Stamped signed PDF (signature + audit block on a final page) using `pdf-lib`, mirroring the existing `contract-sign` flow
- Storage in existing `client-assets` bucket
- Reserve a journey/checklist scaffold (empty `journey_templates` rows for `tier='app_development'`) for future stages
- No emails, no payments, no other workflow changes

## Data model

New table `client_proposals`:

- `id`, `client_id`, `client_project_id`
- `title`, `description` (optional)
- `source_pdf_path` (storage path of admin upload)
- `status`: `draft` | `sent` | `signed` | `voided`
- `client_signature_name`, `client_signature_type` (`typed`|`drawn`), `client_signature_data` (drawn data URL)
- `client_signed_at`, `client_ip`, `client_user_agent`, `client_audit` (jsonb)
- `agency_signer_name` (default `Tambria Kemp`), `agency_countersigned_at`
- `signed_pdf_path` (output of stamping), `pdf_generated_at`
- `created_at`, `updated_at`

RLS: admins manage; service role full access (matches `client_contracts` pattern). Portal access goes through edge function with service role, scoped by `clientId`, same model as existing `contract-sign`.

Add `journey_templates` rows for `tier='app_development'` with one placeholder node so the system can later render a journey for these projects (no behavior change today; admin UI hides the journey for now).

## Storage

Reuse `client-assets` bucket:
- Source upload: `proposals/{clientId}/{proposalId}/source.pdf`
- Signed output: `proposals/{clientId}/{proposalId}/signed.pdf`

Access via signed URLs minted by the edge function (matches contract pattern).

## Edge function: `proposal-sign`

Single function, action-routed (mirrors `contract-sign`):

- `list` — admin or portal: returns proposals for a client (optionally filtered by project)
- `upload-url` — admin: returns a short-lived signed upload URL for `source.pdf`
- `create` — admin: after upload, inserts the `client_proposals` row with `source_pdf_path`, `title`
- `get` — returns one proposal + signed URLs for source and (if present) signed PDF
- `sign` — portal: validates payload, stamps signature + audit page onto source PDF using `pdf-lib`, writes `signed.pdf`, updates row to `status='signed'`
- `void` / `delete` — admin: void unsigned proposals; signed proposals are immutable
- `download` — admin/portal: returns signed URL for source or signed PDF

PDF stamping reuses helpers from `supabase/functions/contract-sign/index.ts` (drawn signature embed, typed signature font, audit page renderer). Extract shared helpers into `supabase/functions/_shared/sign-pdf.ts` so both functions stay in sync.

## Admin UI

- `src/pages/admin/ClientDetail.tsx`: add `app_development` to project type select and `TYPE_LABEL`. New project tile renders a simplified card (no journey/stage block) showing proposal count + latest status.
- `src/pages/admin/ProjectDetail.tsx`: route `app_development` to a new `AppDevelopmentView`.
- New `src/pages/admin/AppDevelopmentView.tsx`:
  - Header (project name, client link)
  - "Proposals" panel listing each proposal: title, status pill, upload date, signed date, download buttons (source + signed)
  - "Upload new proposal" action (drag-drop or file picker, title field)
  - Per-row actions: copy portal link hint, void (if unsigned), download

## Portal UI

- `src/pages/Portal.tsx`: add a `ProposalsSection` rendered for clients with any `app_development` project.
- New `src/components/portal/ProposalsSection.tsx`:
  - Lists all proposals (newest first), each as a collapsible card
  - Unsigned: shows embedded PDF preview (iframe of signed source URL) + sign panel reused from `ContractSection` (typed/drawn modes, agreed checkbox, audit collection)
  - Signed: shows signed metadata + download button for the signed PDF

Reuse the existing signature canvas + audit collection logic from `src/components/portal/ContractSection.tsx` by extracting it into `src/components/portal/SignaturePad.tsx` and `src/lib/sign-audit.ts`.

## Out of scope (can add later)

- Email notifications on upload/sign
- Journey/checklist behavior for app dev projects
- Versioning relationships between proposals (parent/child)
- Counter-signing UI for the agency (auto-stamped at sign time today)

## Files (new / changed)

New:
- `supabase/functions/proposal-sign/index.ts` (+ `deno.json`)
- `supabase/functions/_shared/sign-pdf.ts` (extract from `contract-sign`)
- `src/pages/admin/AppDevelopmentView.tsx`
- `src/components/portal/ProposalsSection.tsx`
- `src/components/portal/SignaturePad.tsx`
- `src/lib/sign-audit.ts`

Changed:
- `supabase/config.toml` (register new function)
- `supabase/functions/contract-sign/index.ts` (use shared helpers)
- `src/pages/admin/ClientDetail.tsx` (new type option, card variant)
- `src/pages/admin/ProjectDetail.tsx` (route new type)
- `src/pages/Portal.tsx` (mount ProposalsSection)
- `src/components/portal/ContractSection.tsx` (use shared SignaturePad)

Migration:
- Create `client_proposals` table + RLS policies
- Insert placeholder `journey_templates` row for `tier='app_development'`
