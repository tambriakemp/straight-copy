## Contract System Plan

### 1. Database (one migration)

New table `client_contracts`:
- `id`, `client_id` (FK clients), `tier` (launch/growth), `template_version` (text, e.g. `"launch-v1"`)
- Client signature: `client_signature_name`, `client_signature_type` ('typed'|'drawn'), `client_signature_data` (text — drawn = base64 PNG, typed = name), `client_signed_at`, `client_ip`, `client_user_agent`
- Counter: `agency_signer_name` (default `'Tambria Kemp'`), `agency_countersigned_at` (auto-set on insert via default `now()`)
- PDF: `pdf_path`, `pdf_url`, `pdf_generated_at`
- `created_at`, `updated_at`

RLS: admins manage all; service role manages all. Portal access goes through edge functions (service role), so no client-facing RLS needed.

Storage: reuse existing private `client-assets` bucket — PDFs stored at `contracts/{clientId}/{contractId}.pdf`, signed URLs returned to portal.

### 2. Hardcoded contract templates

New file `src/lib/contract-templates.ts` and matching `supabase/functions/_shared/contract-templates.ts` (mirrored, like the journey-checklist pattern):
- `LAUNCH_CONTRACT` — full agreement text + version string `launch-v1`
- `GROWTH_CONTRACT` — full agreement text + version string `growth-v1`
- Each exports `{ version, title, sections: [{heading, body}] }` so we can render to both HTML (portal) and PDF (server) from one source.
- I'll seed both with placeholder service-agreement text covering: scope, payment, deliverables, IP, confidentiality, termination, signatures. **You'll review and tell me what to change before this ships** — easy edits since it's plain TS strings.

### 3. Edge function `contract-sign`

New `supabase/functions/contract-sign/index.ts` with three actions:
- **`get`** → returns the active contract for a client: rendered template based on `clients.tier`, plus existing signature record if already signed (so portal shows signed state).
- **`sign`** → accepts `{ clientId, signatureType, signatureData, signatureName }`. Validates with Zod. Captures IP from `x-forwarded-for` and UA. Inserts into `client_contracts` (countersigned timestamp auto-set). Generates PDF inline (using `jsPDF` via npm import — already used elsewhere or pdf-lib). Uploads to `client-assets/contracts/{clientId}/{id}.pdf`. Then flips `intake.contract_signed` AND `intake.contract_countersigned` items on the client's intake journey node to `done: true` (mirrors how `accounts_submitted` is flipped today). Returns `{ success, contract, pdfUrl }`.
- **`download`** → returns a signed URL for the stored PDF (admin or portal).

`verify_jwt = false` (portal is unauthenticated, like `brand-kit-intake`). Function is added to `supabase/config.toml`.

### 4. Portal UI changes

**Rename Node 01:**
- `AccountAccessSection.tsx` line 177: change `"Node 01 · Foundations"` → `"Node 01 · Intake"`. (Header/eyebrow and title stay distinct — title remains "Set Up Your Accounts".)
- The active-node chip in Portal header already uses `node.label` which is "Intake" from the template, so no change needed there.

**Add Contract section** (new component `src/components/portal/ContractSection.tsx`, rendered above `AccountAccessSection`):
- Collapsible card matching the existing `portal-access` styling.
- Header: eyebrow "Node 01 · Intake", title "Sign Your *Agreement*."
- Status chip: "Not signed" / "Signed ✓ {date}".
- Body when unsigned: short intro + **"Review & Sign Contract"** button → opens dialog/inline expansion with full contract text in a scrollable container, then signature panel.
- Signature panel (Radix Tabs):
  - **Type** tab (default): legal-name input + "I agree to the terms above" checkbox + script-font preview of typed name.
  - **Draw** tab: HTML5 canvas with mouse + touch support, Clear + Done buttons, exports to PNG via `canvas.toDataURL()`.
- Submit calls `contract-sign:sign`. On success: collapses to signed state showing both signatures, signing date, and a **"Download PDF"** button.
- When signed, both `intake.contract_signed` and `intake.contract_countersigned` checklist items appear `done` in the admin view automatically (handled server-side).

### 5. Admin UI

In `src/pages/admin/ClientDetail.tsx`, new **"Contract"** section in the client detail (alongside existing client info / journey panels):
- Shows current contract status: Unsigned / Signed on {date} by {name}.
- If signed: "Download signed PDF" button (calls `contract-sign:download`), shows client signature method (typed/drawn) + IP + UA snippet for audit.
- If unsigned: "Send contract link" helper text (just shows the portal URL — actual SureContact email comes later if you want).
- Read-only — admin doesn't sign on the client's behalf; the auto-countersignature happens at signing time.

### 6. PDF generation (server-side)

In the edge function, use `jspdf` (npm:jspdf via esm.sh) to:
1. Render contract title, version, date.
2. Each section as heading + body (auto-page-break).
3. Two signature blocks at end:
   - **Client:** if typed → name in cursive font (jsPDF supports embedding TTFs; I'll embed `Great Vibes` or `Allura` from Google Fonts, base64-encoded). If drawn → embed the PNG. + printed name + date + IP.
   - **Agency:** "Tambria Kemp" rendered in the same cursive font + "Cre8 Visions, LLC" + date.
4. Save buffer → upload to storage → return path.

PDF QA: I'll generate a sample with a fake signature, convert to image, and visually check before considering this done.

### 7. Script font

Add Google Font `Great Vibes` link to `index.html` (already loads other fonts editorially) for the typed-signature on-screen preview. The PDF embeds the same TTF directly so output matches.

### Files touched

**New:**
- `supabase/migrations/{ts}_client_contracts.sql`
- `src/lib/contract-templates.ts`
- `supabase/functions/_shared/contract-templates.ts`
- `supabase/functions/contract-sign/index.ts` + `deno.json`
- `src/components/portal/ContractSection.tsx`
- `src/components/admin/ContractSection.tsx`

**Edited:**
- `src/components/portal/AccountAccessSection.tsx` (rename "Foundations" → "Intake")
- `src/pages/Portal.tsx` (mount `<ContractSection>` above `<AccountAccessSection>`)
- `src/pages/admin/ClientDetail.tsx` (mount admin `<ContractSection>`)
- `src/index.css` (styles for `.portal-contract-*` and `.crm-contract-*`)
- `supabase/config.toml` (add `[functions.contract-sign]` with `verify_jwt = false`)
- `index.html` (add Great Vibes font link)

### Out of scope (for follow-up)
- Sending contract via SureContact email (will need a separate "send contract" trigger and a SureContact template variable for the portal link — happy to add next).
- Editable contract templates (you chose hardcoded; we can graduate to a `contract_templates` table later if needed).
- Multi-page contract amendments / re-signing flows.

After you approve, I'll execute this end to end and visually QA the generated PDF before handing back.