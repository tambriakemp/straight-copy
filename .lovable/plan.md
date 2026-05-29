## Goal

Replace the stacked/expandable section layout on every project detail page with a clean horizontal tabbed layout. Each project type shows only the tabs that apply to it, on both the admin side and the client portal side.

## Tab map per project type

App Development / Web Development / Marketing
- Proposals
- Payment Schedule
- Preview

Site Preview
- Preview (keeps its existing internal Pages/Files/Comments/Settings sub-tabs)
- Proposals
- Payment Schedule

Automation Build
- Journey (existing journey board)
- Contract
- Brand Voice / Brand Kit (admin: links; portal: chat + confirmation)
- Account Access (portal-only)
- Subscription
- Payment Schedule

The header (project name, eyebrow, back link) stays above the tab bar. The current "expandable Preview" card on the portal becomes a regular tab — no more accordion.

## Admin side changes

`src/pages/admin/AppDevelopmentView.tsx`
- Wrap the existing Proposals list, `ProjectInvoicesCard`, and `ProjectPreviewCard` in a `Tabs` component (`@/components/ui/tabs`) styled to match the CRM dark theme.
- Tabs: Proposals (default) · Payment Schedule · Preview.
- Keep the existing "Upload proposal / Copy portal link" toolbar inside the Proposals tab only.

`src/pages/admin/AutomationBuildView.tsx`
- Identify the existing top-level sections (journey board, AdminContractSection, brand voice/kit blocks, subscription/invoices area) and group them under tabs: Journey · Contract · Brand Kit · Subscription · Payment Schedule.
- The journey board stays the default tab so today's workflow is unchanged.
- No business-logic changes — just move existing JSX blocks into `TabsContent` wrappers.

`src/pages/admin/PreviewDetail.tsx` (site_preview)
- Wrap the whole detail in an outer `Tabs`: Preview (default, contains the existing Pages/Files/Comments/Settings tabs untouched) · Proposals · Payment Schedule.
- Reuse the proposals list block from `AppDevelopmentView` (extract into a small shared `ProjectProposalsPanel` component to avoid duplication) and `ProjectInvoicesCard` for the schedule tab.

## Portal side changes

`src/pages/PortalProject.tsx`
- Replace the long stacked `<section>` blocks (Contract, Preview, Proposals, BrandVoice, AccountAccess, Subscription, BrandKit, Invoice) with a single `Tabs` element below the project header.
- Tab visibility is driven by the existing `isAutomation` / `isPreviewable` / `currentProject` flags so each project type only sees relevant tabs.
- Default tab per type: automation_build → Contract; app/web/marketing → Proposals; site_preview → Preview.
- `PortalProjectPreviewCard` is rendered in the Preview tab as a flat panel — drop the expand/collapse chrome.

## Shared work

- Add a small `ProjectTabs` wrapper around `@/components/ui/tabs` with CRM-themed classes (borderless underline tabs, serif italic active state, taupe inactive) so admin and portal share styling.
- Extract `ProjectProposalsPanel` (admin) so `AppDevelopmentView` and `PreviewDetail` can both mount it.
- No edge function, schema, or data-fetching changes. URL routes stay the same; tab state is local (`useState`) and not persisted in the URL unless you want it (open question below).

## Open question

Persist the active tab in the URL (`?tab=preview`) so reloads and shared links land on the same tab? Default plan is local state only; happy to add the query param if you want shareable deep links.
